import type { Elder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { raiseAlert } from "@/lib/alerts";
import { minutesOfDay, startOfZonedDay, zonedDayKey, zonedParts } from "@/lib/time";
import { MOOD_SCORE } from "@/lib/ai/nlu";
import { assessDay, isLateStart, type DayAssessment, type DayFeatures } from "@/lib/ai/routine";

// Activity before this local time (night-time bathroom trips) doesn't count as "starting the day".
const DAY_START_MIN = 4 * 60;
// After this local hour, today has enough data to be compared as a full day.
const FULL_DAY_HOUR = 20;

// Builds one feature row per local day for the last `days` days (oldest first, today last).
export async function computeDailyFeatures(elder: Elder, days: number, now = new Date()): Promise<DayFeatures[]> {
  const tz = elder.timezone;
  const since = startOfZonedDay(new Date(now.getTime() - (days - 1) * 24 * 3600_000), tz);
  const where = { elderId: elder.id, createdAt: { gte: since } };

  const [motion, checkIns, reports, moods, chats] = await Promise.all([
    prisma.sensorReading.findMany({ where: { ...where, kind: "motion" }, select: { value: true, createdAt: true } }),
    prisma.checkIn.findMany({
      where: { elderId: elder.id, scheduledFor: { gte: since, lte: now } },
      select: { status: true, respondedAt: true, response: true, reminder: { select: { type: true } }, scheduledFor: true },
    }),
    prisma.selfReport.findMany({ where, select: { kind: true, answer: true, score: true, createdAt: true, source: true } }),
    prisma.moodLog.findMany({ where, select: { mood: true, createdAt: true } }),
    prisma.chatMessage.findMany({ where: { ...where, role: "user" }, select: { createdAt: true } }),
  ]);

  type Acc = {
    first: number | null;
    motion: number | null;
    due: number;
    done: number;
    meals: number | null;
    wellbeing: number[];
    interactions: number;
  };
  const byDay = new Map<string, Acc>();
  const acc = (d: Date) => {
    const key = zonedDayKey(d, tz);
    let a = byDay.get(key);
    if (!a) {
      a = { first: null, motion: null, due: 0, done: 0, meals: null, wellbeing: [], interactions: 0 };
      byDay.set(key, a);
    }
    return a;
  };
  const sawLife = (d: Date) => {
    const m = minutesOfDay(d, tz);
    if (m < DAY_START_MIN) return;
    const a = acc(d);
    a.first = a.first === null ? m : Math.min(a.first, m);
  };

  for (const r of motion) {
    const a = acc(r.createdAt);
    a.motion = (a.motion ?? 0) + Math.max(0, r.value);
    if (r.value > 0) sawLife(r.createdAt);
  }
  for (const c of checkIns) {
    const a = acc(c.scheduledFor);
    if (c.status !== "PENDING") {
      a.due++;
      if (c.status.startsWith("DONE")) a.done++;
    }
    if (c.reminder.type === "MEAL") a.meals = (a.meals ?? 0) + (c.status.startsWith("DONE") ? 1 : 0);
    if (c.respondedAt) {
      acc(c.respondedAt).interactions++;
      sawLife(c.respondedAt);
    }
  }
  for (const r of reports) {
    const a = acc(r.createdAt);
    if (r.kind === "MEAL") a.meals = (a.meals ?? 0) + (r.answer === "yes" ? 1 : 0);
    if (r.score !== null) a.wellbeing.push(r.score);
    if (r.source !== "chat") a.interactions++; // chat messages are counted below
    sawLife(r.createdAt);
  }
  for (const m of moods) {
    const a = acc(m.createdAt);
    a.wellbeing.push(MOOD_SCORE[m.mood] ?? 0);
    a.interactions++;
    sawLife(m.createdAt);
  }
  for (const c of chats) {
    acc(c.createdAt).interactions++;
    sawLife(c.createdAt);
  }

  const out: DayFeatures[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = zonedDayKey(new Date(now.getTime() - i * 24 * 3600_000), tz);
    const a = byDay.get(key);
    out.push({
      day: key,
      firstActivityMin: a?.first ?? null,
      activityCount: a?.motion ?? null,
      adherence: a && a.due ? Math.round((a.done / a.due) * 100) / 100 : null,
      mealReports: a?.meals ?? null,
      wellbeing: a?.wellbeing.length
        ? Math.round((a.wellbeing.reduce((s, x) => s + x, 0) / a.wellbeing.length) * 100) / 100
        : null,
      interactions: a?.interactions ?? 0,
    });
  }
  return out;
}

// Today is only partially observed until the evening: counts (movement, meals, interactions)
// would look "low" all morning, so they're left out of today's comparison until FULL_DAY_HOUR.
function forComparison(today: DayFeatures, fullDay: boolean): DayFeatures {
  if (fullDay) return today;
  return { ...today, activityCount: null, mealReports: null, interactions: null };
}

export type RoutineInsights = {
  days: (DayFeatures & { score: number; flagged: boolean })[];
  today: DayAssessment;
  todayIsPartial: boolean;
  lateStart: ReturnType<typeof isLateStart>;
};

const BASELINE_WINDOW = 28;

export async function getRoutineInsights(elder: Elder, now = new Date(), showDays = 14): Promise<RoutineInsights> {
  const all = await computeDailyFeatures(elder, BASELINE_WINDOW + showDays, now);
  const hour = zonedParts(now, elder.timezone).hour;
  const fullDay = hour >= FULL_DAY_HOUR;

  const days = all.slice(-showDays).map((d, idx) => {
    const i = all.length - showDays + idx;
    const history = all.slice(Math.max(0, i - BASELINE_WINDOW), i);
    const isToday = i === all.length - 1;
    const a = assessDay(isToday ? forComparison(d, fullDay) : d, history);
    return { ...d, score: a.score, flagged: a.deviations.length > 0 };
  });

  const todayIdx = all.length - 1;
  const history = all.slice(Math.max(0, todayIdx - BASELINE_WINDOW), todayIdx);
  const today = all[todayIdx];
  const todayAssessment = assessDay(forComparison(today, fullDay), history);

  return {
    days,
    today: todayAssessment,
    todayIsPartial: !fullDay,
    lateStart: isLateStart(
      history.map((d) => d.firstActivityMin),
      minutesOfDay(now, elder.timezone),
      today.firstActivityMin !== null
    ),
  };
}

// Called by the scheduler for each elder on every tick; cheap enough at family scale.
export async function runRoutineChecks(elder: Elder, now = new Date()) {
  const { hour } = zonedParts(now, elder.timezone);
  const day = zonedDayKey(now, elder.timezone);
  const name = elder.name.split(" ")[0];

  // Morning: no sign of life well past the usual start time.
  if (hour >= 6 && hour < 14) {
    const alreadyRaised = await prisma.alert.findUnique({ where: { dedupeKey: `latestart:${elder.id}:${day}` } });
    if (!alreadyRaised) {
      const insights = await getRoutineInsights(elder, now, 1);
      if (insights.lateStart.late && insights.lateStart.usual !== undefined) {
        const usual = insights.lateStart.usual;
        await raiseAlert({
          elderId: elder.id,
          kind: "ROUTINE_ANOMALY",
          severity: "warning",
          title: "No activity yet this morning",
          message: `${name} is usually up and about by ${String(Math.floor(usual / 60)).padStart(2, "0")}:${String(Math.round(usual % 60)).padStart(2, "0")}, but nothing has been detected yet today. Maybe give them a call?`,
          data: { usualFirstActivityMin: usual },
          dedupeKey: `latestart:${elder.id}:${day}`,
        });
      }
    }
  }

  // Evening: compare the whole day against the baseline.
  if (hour >= FULL_DAY_HOUR) {
    const key = `routine:${elder.id}:${day}`;
    if (await prisma.alert.findUnique({ where: { dedupeKey: key } })) return;
    const insights = await getRoutineInsights(elder, now, 1);
    const devs = insights.today.deviations;
    if (!devs.length) return;
    await raiseAlert({
      elderId: elder.id,
      kind: "ROUTINE_ANOMALY",
      severity: devs.length >= 2 ? "warning" : "info",
      title: devs.length >= 2 ? "Today looked quite different from usual" : `Unusual: ${devs[0].label.toLowerCase()}`,
      message: devs.map((d) => d.explanation).join(". ") + ".",
      data: { deviations: devs, score: insights.today.score },
      dedupeKey: key,
    });
  }
}
