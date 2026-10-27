// Routine-deviation detection (the "anomaly detection" deliverable).
//
// Each day is summarised as a small feature vector (first activity time, how much movement the hub
// saw, reminder adherence, meal self-reports, wellbeing, interactions). Today is compared against the
// senior's *own* rolling baseline using a robust z-score: (x - median) / (1.4826 * MAD).
// Median/MAD instead of mean/std so one odd day in the baseline (a family visit, a hospital trip)
// doesn't distort what "normal" looks like. Every flag carries a plain-language explanation,
// because a caregiver has to be able to act on it.
//
// Pure functions only — the DB side lives in routine-service.ts.

import { formatMinutes } from "@/lib/time";

export type DayFeatures = {
  day: string; // YYYY-MM-DD, elder-local
  firstActivityMin: number | null; // minutes after local midnight of the first sign of life
  activityCount: number | null; // hub motion events (null when no hub data that day)
  adherence: number | null; // done / due check-ins, 0..1 (null when nothing was due)
  mealReports: number | null; // meals reported or answered yes (null when no meal data)
  wellbeing: number | null; // mean wellbeing score of mood + self-reports + chat, -1..1
  interactions: number | null; // app taps, chat messages, check-in answers
};

export type FeatureKey = Exclude<keyof DayFeatures, "day">;

type Spec = {
  key: FeatureKey;
  label: string;
  // Only flag deviations in this direction ("high" = larger than usual is the concern).
  direction: "high" | "low" | "both";
  // Ignore deviations smaller than this in absolute terms, however "significant" the z-score —
  // a very regular person would otherwise get flagged for waking 10 minutes late.
  minDelta: number;
  // Floor for the robust scale, same units as the feature.
  minScale: number;
  describe: (value: number, baseline: number) => string;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const FEATURE_SPECS: Spec[] = [
  {
    key: "firstActivityMin",
    label: "First activity",
    direction: "high",
    minDelta: 45,
    minScale: 20,
    describe: (v, b) => {
      const diff = Math.round(v - b);
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return `First activity at ${formatMinutes(v)}, usually around ${formatMinutes(b)} (${h ? `${h}h ` : ""}${m}m later)`;
    },
  },
  {
    key: "activityCount",
    label: "Movement at home",
    direction: "low",
    minDelta: 8,
    minScale: 4,
    describe: (v, b) => `Only ${Math.round(v)} movement events detected, usually about ${Math.round(b)}`,
  },
  {
    key: "adherence",
    label: "Reminder adherence",
    direction: "low",
    // Someone with a near-perfect record has MAD = 0; without a generous floor, missing a single
    // one of three reminders would already look "extreme". Flag only clearly worse days.
    minDelta: 0.34,
    minScale: 0.2,
    describe: (v, b) => `Answered ${pct(v)} of reminders, usually ${pct(b)}`,
  },
  {
    key: "mealReports",
    label: "Meals",
    direction: "low",
    minDelta: 1,
    minScale: 0.5,
    describe: (v, b) => `${Math.round(v)} meal${Math.round(v) === 1 ? "" : "s"} reported, usually ${Math.round(b)}`,
  },
  {
    key: "wellbeing",
    label: "Wellbeing",
    direction: "low",
    minDelta: 0.4,
    minScale: 0.15,
    describe: (v, b) => `Wellbeing ${v < 0 ? "low" : "lower than usual"} (${v.toFixed(2)} vs usual ${b.toFixed(2)})`,
  },
  {
    key: "interactions",
    label: "Interactions",
    direction: "low",
    minDelta: 3,
    minScale: 1.5,
    describe: (v, b) => `${Math.round(v)} interactions with the app/hub, usually about ${Math.round(b)}`,
  },
];

export const MIN_BASELINE_DAYS = 5;
export const Z_THRESHOLD = 2.5;

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function robustStats(xs: number[], minScale = 0) {
  const med = median(xs);
  const mad = median(xs.map((x) => Math.abs(x - med)));
  return { median: med, scale: Math.max(1.4826 * mad, minScale) };
}

export type Deviation = {
  key: FeatureKey;
  label: string;
  value: number;
  baseline: number;
  z: number;
  explanation: string;
};

export type DayAssessment = {
  day: string;
  deviations: Deviation[];
  // Root-mean-square of the per-feature z-scores in the "bad" direction: one number to sort/plot by.
  score: number;
  baselineDays: number;
};

export function assessDay(today: DayFeatures, history: DayFeatures[], zThreshold = Z_THRESHOLD): DayAssessment {
  const deviations: Deviation[] = [];
  const zs: number[] = [];
  let baselineDays = 0;

  for (const spec of FEATURE_SPECS) {
    const value = today[spec.key];
    if (value === null) continue;
    const past = history.map((d) => d[spec.key]).filter((v): v is number => v !== null);
    if (past.length < MIN_BASELINE_DAYS) continue;
    baselineDays = Math.max(baselineDays, past.length);

    const { median: base, scale } = robustStats(past, spec.minScale);
    const z = (value - base) / scale;
    const badZ = spec.direction === "high" ? Math.max(0, z) : spec.direction === "low" ? Math.max(0, -z) : Math.abs(z);
    zs.push(badZ);

    if (badZ >= zThreshold && Math.abs(value - base) >= spec.minDelta) {
      deviations.push({
        key: spec.key,
        label: spec.label,
        value,
        baseline: base,
        z: Math.round(z * 10) / 10,
        explanation: spec.describe(value, base),
      });
    }
  }

  const score = zs.length ? Math.sqrt(zs.reduce((s, z) => s + z * z, 0) / zs.length) : 0;
  return { day: today.day, deviations, score: Math.round(score * 100) / 100, baselineDays };
}

// Live check run through the morning: no sign of life yet, and it is now well past the
// senior's usual first-activity time.
export function isLateStart(
  historyFirstActivity: (number | null)[],
  nowMin: number,
  hadActivityToday: boolean
): { late: boolean; usual?: number; threshold?: number } {
  if (hadActivityToday) return { late: false };
  const past = historyFirstActivity.filter((v): v is number => v !== null);
  if (past.length < MIN_BASELINE_DAYS) return { late: false };
  const { median: usual, scale } = robustStats(past, 20);
  const threshold = usual + Math.max(Z_THRESHOLD * scale, 60);
  return { late: nowMin >= threshold, usual, threshold };
}
