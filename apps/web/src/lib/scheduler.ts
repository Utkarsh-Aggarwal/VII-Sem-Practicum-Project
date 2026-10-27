import type { CheckIn, Elder, Reminder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitCareEvent } from "@/lib/events";
import { raiseAlert } from "@/lib/alerts";
import { sendPush } from "@/lib/push";
import { publishToHub } from "@/lib/mqtt";
import { ensureTodayCheckIns } from "@/lib/checkins";
import { asLang } from "@/lib/ai/phrases";
import { reminderAnnouncement } from "@/lib/announce";
import { runRoutineChecks } from "@/lib/ai/routine-service";
import { zonedDayKey, zonedParts } from "@/lib/time";
import { closeIdleConversations } from "@/lib/conversations";

// The backend "cron": every TICK_MS it walks each elder's day and
//   1. dispatches reminders that just came due (hub via MQTT + senior app via push)
//   2. sends one gentle nudge if there's still no answer after REMIND_AGAIN_AFTER_MIN
//   3. marks check-ins MISSED after MISSED_AFTER_MIN and alerts caregivers (critical if missed twice in a row)
//   4. raises hub-offline / no-activity / routine-deviation alerts

const TICK_MS = 30_000;
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);
const remindAgainMin = () => num(process.env.REMIND_AGAIN_AFTER_MIN, 15);
const missedAfterMin = () => num(process.env.MISSED_AFTER_MIN, 60);
const noActivityHours = () => num(process.env.NO_ACTIVITY_ALERT_HOURS, 4);
// Don't fire reminders that came due while the server was down for longer than this.
const STALE_DISPATCH_MIN = 10;
const HUB_OFFLINE_MIN = 10;

export async function dispatchReminder(
  checkIn: CheckIn,
  reminder: Reminder,
  elder: Elder,
  kind: "reminder" | "nudge"
) {
  const lang = asLang(elder.language);
  // The same localised sentence the senior app speaks ("Rameshbhai, it's time to take your medicine…").
  const speak = reminderAnnouncement(reminder, elder, kind);

  const recentMotion = await prisma.sensorReading.findFirst({
    where: { elderId: elder.id, kind: "motion", value: { gt: 0 }, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
  });
  const payload = {
    checkInId: checkIn.id,
    kind,
    type: reminder.type,
    label: reminder.label,
    question: reminder.question,
    speak,
    lang,
    scheduledFor: checkIn.scheduledFor.toISOString(),
    // Lets the hub decide e.g. to chime louder / repeat when nobody has been seen nearby.
    presence: recentMotion ? "nearby" : "unknown",
  };

  const devices = await prisma.device.findMany({ where: { elderId: elder.id } });
  for (const hub of devices.filter((d) => d.kind === "HUB")) publishToHub(hub.id, "reminder", payload);
  await sendPush(
    devices
      .filter((d) => d.kind === "APP" && d.pushToken)
      .map((d) => ({
        to: d.pushToken!,
        title: reminder.label,
        body: speak,
        data: { checkInId: checkIn.id, reminderId: reminder.id, kind },
        channelId: "reminders",
      }))
  );
  emitCareEvent({ elderId: elder.id, type: "reminder.dispatched", payload });
}

async function processReminders(elder: Elder, now: Date) {
  await ensureTodayCheckIns(elder, now);
  const missedMs = missedAfterMin() * 60_000;
  const nudgeMs = remindAgainMin() * 60_000;

  const open = await prisma.checkIn.findMany({
    where: { elderId: elder.id, status: "PENDING", scheduledFor: { lte: now } },
    include: { reminder: true },
    orderBy: { scheduledFor: "asc" },
  });

  for (const c of open) {
    const age = now.getTime() - c.scheduledFor.getTime();

    if (age >= missedMs) {
      const updated = await prisma.checkIn.updateMany({
        where: { id: c.id, status: "PENDING" },
        data: { status: "MISSED" },
      });
      if (!updated.count) continue;
      emitCareEvent({ elderId: elder.id, type: "checkin.updated", payload: { ...c, status: "MISSED" } });
      // Ancient rows (e.g. after the server was off for days) are closed silently.
      if (age > 2 * 24 * 3600_000) continue;

      const previous = await prisma.checkIn.findFirst({
        where: { reminderId: c.reminderId, scheduledFor: { lt: c.scheduledFor } },
        orderBy: { scheduledFor: "desc" },
      });
      const twice = previous?.status === "MISSED";
      const name = elder.name.split(" ")[0];
      await raiseAlert({
        elderId: elder.id,
        kind: "MISSED_REMINDER",
        severity: twice ? "critical" : "warning",
        title: twice ? `Missed ${c.reminder.label} twice in a row` : `Missed: ${c.reminder.label}`,
        message: twice
          ? `${name} hasn't confirmed ${c.reminder.label} (${c.reminder.time}) today or last time. Please check in with them.`
          : `${name} didn't confirm ${c.reminder.label} scheduled for ${c.reminder.time}${c.response === "not_yet" ? " (said “not yet”)" : ""}.`,
        data: { checkInId: c.id, reminderId: c.reminderId },
        dedupeKey: `missed:${c.id}`,
      });
      continue;
    }

    if (!c.notifiedAt) {
      await prisma.checkIn.update({ where: { id: c.id }, data: { notifiedAt: now } });
      if (age <= STALE_DISPATCH_MIN * 60_000) await dispatchReminder(c, c.reminder, elder, "reminder");
      continue;
    }

    if (!c.nudgedAt && age >= nudgeMs) {
      await prisma.checkIn.update({ where: { id: c.id }, data: { nudgedAt: now } });
      await dispatchReminder(c, c.reminder, elder, "nudge");
    }
  }
}

async function processHubs(elder: Elder, now: Date) {
  const hubs = await prisma.device.findMany({ where: { elderId: elder.id, kind: "HUB" } });
  const name = elder.name.split(" ")[0];

  for (const hub of hubs) {
    if (hub.online && hub.lastSeenAt && now.getTime() - hub.lastSeenAt.getTime() > HUB_OFFLINE_MIN * 60_000) {
      await prisma.device.update({ where: { id: hub.id }, data: { online: false } });
      emitCareEvent({ elderId: elder.id, type: "device.status", payload: { deviceId: hub.id, online: false } });
      await raiseAlert({
        elderId: elder.id,
        kind: "HUB_OFFLINE",
        severity: "info",
        title: `${hub.name} went offline`,
        message: `The home hub hasn't reported since ${hub.lastSeenAt.toLocaleTimeString("en-IN", { timeZone: elder.timezone, hour: "2-digit", minute: "2-digit" })}. Check its power and Wi-Fi.`,
        dedupeKey: `huboffline:${hub.id}:${hub.lastSeenAt.getTime()}`,
      });
    }
  }

  // "No activity in the living room for N hours" — only meaningful while a hub is online and
  // has been reporting motion at all, and only during waking hours.
  const { hour } = zonedParts(now, elder.timezone);
  const onlineHub = hubs.some((h) => h.online);
  if (!onlineHub || hour < 9 || hour >= 21) return;

  const windowStart = new Date(now.getTime() - noActivityHours() * 3600_000);
  const [anyRecent, lastMotion] = await Promise.all([
    prisma.sensorReading.findFirst({ where: { elderId: elder.id, kind: "motion", createdAt: { gte: windowStart } } }),
    prisma.sensorReading.findFirst({
      where: { elderId: elder.id, kind: "motion", value: { gt: 0 } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  // Hub reported motion=0 during the window (so it's working) but nothing positive since windowStart.
  if (anyRecent && lastMotion && lastMotion.createdAt < windowStart) {
    await raiseAlert({
      elderId: elder.id,
      kind: "NO_ACTIVITY",
      severity: "warning",
      title: `No movement for ${noActivityHours()}+ hours`,
      message: `The hub hasn't seen ${name} move since ${lastMotion.createdAt.toLocaleTimeString("en-IN", { timeZone: elder.timezone, hour: "2-digit", minute: "2-digit" })}.`,
      dedupeKey: `noactivity:${elder.id}:${zonedDayKey(now, elder.timezone)}:${lastMotion.id}`,
    });
  }
}

export async function tick(now = new Date()) {
  try {
    await closeIdleConversations(now);
  } catch (err) {
    console.error("[scheduler] conversation summaries:", err);
  }
  const elders = await prisma.elder.findMany();
  for (const elder of elders) {
    try {
      await processReminders(elder, now);
      await processHubs(elder, now);
      await runRoutineChecks(elder, now);
    } catch (err) {
      console.error(`[scheduler] elder ${elder.id}:`, err);
    }
  }
}

const g = globalThis as unknown as { ccScheduler?: ReturnType<typeof setInterval>; ccTickRunning?: boolean };

export function startScheduler() {
  if (g.ccScheduler || process.env.SCHEDULER_DISABLED) return;
  const run = async () => {
    if (g.ccTickRunning) return; // a slow tick never overlaps the next
    g.ccTickRunning = true;
    try {
      await tick();
    } finally {
      g.ccTickRunning = false;
    }
  };
  g.ccScheduler = setInterval(run, TICK_MS);
  setTimeout(run, 2_000);
  console.log(`[scheduler] running every ${TICK_MS / 1000}s`);
}
