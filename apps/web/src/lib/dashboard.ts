import type { Caregiver, Elder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SENSOR_KINDS } from "@/lib/hub";
import { startOfZonedDay, zonedParts } from "@/lib/time";

// Read models shared by the dashboard pages (server components) and the JSON API.

export async function getEnvironment(elder: Elder, now = new Date()) {
  const dayStart = startOfZonedDay(now, elder.timezone);
  const since24h = new Date(now.getTime() - 24 * 3600_000);

  const [latest, hubs, motionToday, lastMotion] = await Promise.all([
    Promise.all(
      SENSOR_KINDS.filter((k) => k !== "motion").map((kind) =>
        prisma.sensorReading.findFirst({
          where: { elderId: elder.id, kind, createdAt: { gte: since24h } },
          orderBy: { createdAt: "desc" },
          select: { kind: true, value: true, createdAt: true },
        })
      )
    ),
    prisma.device.findMany({
      where: { elderId: elder.id, kind: "HUB" },
      select: { id: true, name: true, online: true, lastSeenAt: true },
    }),
    prisma.sensorReading.findMany({
      where: { elderId: elder.id, kind: "motion", value: { gt: 0 }, createdAt: { gte: dayStart } },
      orderBy: { createdAt: "asc" },
      select: { value: true, createdAt: true },
    }),
    prisma.sensorReading.findFirst({
      where: { elderId: elder.id, kind: "motion", value: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const hourly = Array.from({ length: 24 }, () => 0);
  for (const m of motionToday) hourly[zonedParts(m.createdAt, elder.timezone).hour] += m.value;

  return {
    readings: Object.fromEntries(latest.filter(Boolean).map((r) => [r!.kind, { value: r!.value, at: r!.createdAt }])) as Record<
      string,
      { value: number; at: Date }
    >,
    hubs,
    activeSince: motionToday[0]?.createdAt ?? null,
    lastMotionAt: lastMotion?.createdAt ?? null,
    motionByHour: hourly,
  };
}

export async function listAlerts(elderId: string, opts: { onlyOpen?: boolean; take?: number } = {}) {
  return prisma.alert.findMany({
    where: { elderId, ...(opts.onlyOpen ? { acknowledgedAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 30,
  });
}

// Everything a caregiver's home screen needs, for the web home page and the caregiver mobile mode.
export async function caregiverOverview(caregiver: Caregiver, now = new Date()) {
  const elders = await prisma.elder.findMany({
    where: { caregivers: { some: { caregiverId: caregiver.id } } },
    orderBy: { createdAt: "asc" },
    include: { caregivers: { where: { caregiverId: caregiver.id } } },
  });

  return Promise.all(
    elders.map(async (elder) => {
      const today = startOfZonedDay(now, elder.timezone);
      const [checkIns, openAlerts, lastMood, hubs, lastTalk] = await Promise.all([
        prisma.checkIn.findMany({
          where: { elderId: elder.id, scheduledFor: { gte: today, lt: new Date(today.getTime() + 24 * 3600_000) } },
          include: { reminder: { select: { label: true, time: true, type: true } } },
          orderBy: { scheduledFor: "asc" },
        }),
        prisma.alert.findMany({
          where: { elderId: elder.id, acknowledgedAt: null },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.moodLog.findFirst({ where: { elderId: elder.id }, orderBy: { createdAt: "desc" } }),
        prisma.device.findMany({ where: { elderId: elder.id, kind: "HUB" }, select: { online: true } }),
        prisma.conversation.findFirst({
          where: { elderId: elder.id, summary: { not: null } },
          orderBy: { startedAt: "desc" },
          select: { summary: true, mood: true, startedAt: true, usedVoice: true },
        }),
      ]);
      const missed = checkIns.filter((c) => c.status === "MISSED");
      return {
        elder: { id: elder.id, name: elder.name, avatarColor: elder.avatarColor, relation: elder.caregivers[0]?.relation ?? "", phone: elder.phone },
        status: familyStatus({
          openAlerts,
          missedLabels: missed.map((c) => c.reminder.label),
          lastTalkMood: lastTalk?.mood ?? null,
          done: checkIns.filter((c) => c.status.startsWith("DONE")).length,
          total: checkIns.length,
        }),
        lastTalk: lastTalk ? { summary: lastTalk.summary!, mood: lastTalk.mood, at: lastTalk.startedAt, usedVoice: lastTalk.usedVoice } : null,
        done: checkIns.filter((c) => c.status.startsWith("DONE")).length,
        missed: missed.length,
        pending: checkIns.filter((c) => c.status === "PENDING").length,
        total: checkIns.length,
        timeline: checkIns.map((c) => ({ id: c.id, label: c.reminder.label, time: c.reminder.time, type: c.reminder.type, status: c.status })),
        openAlerts,
        lastMood: lastMood ? { mood: lastMood.mood, at: lastMood.createdAt } : null,
        hub: hubs.length ? (hubs.some((h) => h.online) ? "online" : "offline") : "none",
      };
    })
  );
}

// --- Plain-language status ("All good today" / "Needs attention: …") ---

export type FamilyStatus = { tone: "good" | "warn" | "bad"; label: string; detail: string };

export function familyStatus(input: {
  openAlerts: { severity: string; title: string }[];
  missedLabels: string[];
  lastTalkMood: string | null;
  done: number;
  total: number;
}): FamilyStatus {
  const urgent = input.openAlerts.find((a) => a.severity === "critical");
  if (urgent) return { tone: "bad", label: "Needs you now", detail: urgent.title };
  const warning = input.openAlerts.find((a) => a.severity === "warning");
  if (warning) return { tone: "warn", label: "Needs attention", detail: warning.title };
  if (input.missedLabels.length) {
    return { tone: "warn", label: "Needs attention", detail: `Missed ${input.missedLabels.slice(0, 2).join(" and ")}` };
  }
  if (input.lastTalkMood === "unwell" || input.lastTalkMood === "low") {
    return { tone: "warn", label: "Check in", detail: input.lastTalkMood === "unwell" ? "Mentioned feeling unwell" : "Seemed low in their last chat" };
  }
  return {
    tone: "good",
    label: "All good today",
    detail: input.total ? `${input.done} of ${input.total} reminders done` : "No reminders today",
  };
}

// --- Alerts across every parent the caregiver looks after (Alerts inbox) ---

export async function caregiverAlerts(caregiverId: string, opts: { onlyOpen?: boolean; take?: number } = {}) {
  return prisma.alert.findMany({
    where: {
      elder: { caregivers: { some: { caregiverId } } },
      ...(opts.onlyOpen ? { acknowledgedAt: null } : {}),
    },
    include: { elder: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
  });
}

export async function openAlertCount(caregiverId: string) {
  return prisma.alert.count({
    where: { elder: { caregivers: { some: { caregiverId } } }, acknowledgedAt: null, severity: { not: "info" } },
  });
}
