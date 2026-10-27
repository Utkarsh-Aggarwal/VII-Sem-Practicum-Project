import type { CheckIn, Elder, Reminder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitCareEvent } from "@/lib/events";
import { reminderInstant, startOfZonedDay, zonedParts } from "@/lib/time";
import { asLang, pickPhrase } from "@/lib/ai/phrases";

// A "yes" within this many minutes of the scheduled time counts as on time.
export const ON_TIME_WINDOW_MIN = 30;

export function isScheduledOn(reminder: Pick<Reminder, "daysOfWeek">, isoWeekday: number) {
  return reminder.daysOfWeek.split(",").map(Number).includes(isoWeekday);
}

// Today's active reminders for the elder, each paired with today's CheckIn row (created if missing).
// CheckIns are keyed by (reminderId, scheduledFor) so the scheduler and the apps never create duplicates.
export async function ensureTodayCheckIns(elder: Elder, now = new Date()) {
  const { weekday } = zonedParts(now, elder.timezone);
  const reminders = await prisma.reminder.findMany({
    where: { elderId: elder.id, active: true },
    orderBy: { time: "asc" },
  });

  const items: { reminder: Reminder; checkIn: CheckIn }[] = [];
  for (const reminder of reminders.filter((r) => isScheduledOn(r, weekday))) {
    const scheduledFor = reminderInstant(reminder.time, now, elder.timezone);
    const checkIn = await prisma.checkIn.upsert({
      where: { reminderId_scheduledFor: { reminderId: reminder.id, scheduledFor } },
      create: { elderId: elder.id, reminderId: reminder.id, scheduledFor, status: "PENDING" },
      update: {},
    });
    items.push({ reminder, checkIn });
  }
  return items;
}

// Removes today's not-yet-answered check-ins for a reminder whose time/days changed, so the old slot
// doesn't later turn into a false "missed".
export async function discardStaleCheckIns(reminder: Reminder, timezone: string) {
  await prisma.checkIn.deleteMany({
    where: {
      reminderId: reminder.id,
      status: "PENDING",
      respondedAt: null,
      scheduledFor: { gte: startOfZonedDay(new Date(), timezone) },
    },
  });
}

// Consecutive previous days (before this check-in) on which this reminder was done.
async function streakFor(checkIn: CheckIn) {
  const previous = await prisma.checkIn.findMany({
    where: { reminderId: checkIn.reminderId, scheduledFor: { lt: checkIn.scheduledFor } },
    orderBy: { scheduledFor: "desc" },
    take: 30,
    select: { status: true },
  });
  let n = 0;
  for (const c of previous) {
    if (!c.status.startsWith("DONE")) break;
    n++;
  }
  return n;
}

export type Answer = "yes" | "no";

export async function answerCheckIn(opts: {
  checkIn: CheckIn & { reminder?: Reminder };
  elder: Elder;
  answer: Answer;
  channel: string;
  transcript?: string;
  now?: Date;
}) {
  const { checkIn, elder, answer, channel } = opts;
  const now = opts.now ?? new Date();
  const lang = asLang(elder.language);
  const name = elder.name.split(" ")[0];

  let status = checkIn.status;
  if (answer === "yes") {
    const deadline = checkIn.scheduledFor.getTime() + ON_TIME_WINDOW_MIN * 60_000;
    status = now.getTime() <= deadline ? "DONE_ON_TIME" : "DONE_LATE";
  }
  // "Not yet" keeps it PENDING: the scheduler nudges once more and only marks it MISSED at the deadline.

  const updated = await prisma.checkIn.update({
    where: { id: checkIn.id },
    data: {
      status,
      response: answer === "yes" ? "yes" : "not_yet",
      respondedAt: now,
      channel,
      ...(opts.transcript ? { note: opts.transcript.slice(0, 500) } : {}),
    },
    include: { reminder: true },
  });

  emitCareEvent({ elderId: elder.id, type: "checkin.updated", payload: updated });

  let message: string;
  if (answer === "yes") {
    message = pickPhrase("confirmYes", lang, { name });
    const streak = (await streakFor(updated)) + 1;
    if (streak >= 3) message += " " + pickPhrase("streak", lang, { n: streak });
  } else {
    message = pickPhrase("confirmNotYet", lang, { name });
  }

  return { checkIn: updated, message };
}

// The reminder the senior is most plausibly answering right now: the latest one that has been
// pushed to them in the last 3 hours and is still open.
export async function findOpenCheckIn(elderId: string, now = new Date()) {
  return prisma.checkIn.findFirst({
    where: {
      elderId,
      status: "PENDING",
      scheduledFor: { lte: new Date(now.getTime() + 15 * 60_000), gte: new Date(now.getTime() - 3 * 3600_000) },
    },
    orderBy: { scheduledFor: "desc" },
    include: { reminder: true },
  });
}
