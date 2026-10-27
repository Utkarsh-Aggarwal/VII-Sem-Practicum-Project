import { describe, expect, it } from "vitest";
import { assessDay, isLateStart, robustStats, type DayFeatures } from "@/lib/ai/routine";

function day(i: number, overrides: Partial<DayFeatures> = {}): DayFeatures {
  return {
    day: `2026-10-${String(i).padStart(2, "0")}`,
    firstActivityMin: 405 + ((i * 7) % 20) - 10, // ~06:45 ± 10 min
    activityCount: 50 + ((i * 3) % 8),
    adherence: i % 5 === 0 ? 0.67 : 1,
    mealReports: 2,
    wellbeing: 0.5 + ((i % 3) - 1) * 0.1,
    interactions: 8 + (i % 3),
    ...overrides,
  };
}

const history = Array.from({ length: 14 }, (_, i) => day(i + 1));

describe("robustStats", () => {
  it("ignores a single outlier", () => {
    const { median } = robustStats([10, 11, 9, 10, 300]);
    expect(median).toBe(10);
  });
  it("respects the minimum scale", () => {
    expect(robustStats([5, 5, 5, 5], 2).scale).toBe(2);
  });
});

describe("assessDay", () => {
  it("does not flag a normal day", () => {
    const a = assessDay(day(15), history);
    expect(a.deviations).toEqual([]);
    expect(a.baselineDays).toBe(14);
  });

  it("flags a much later first activity with an explanation", () => {
    const a = assessDay(day(15, { firstActivityMin: 10 * 60 + 30 }), history);
    expect(a.deviations.map((d) => d.key)).toEqual(["firstActivityMin"]);
    expect(a.deviations[0].explanation).toMatch(/First activity at 10:30, usually around 06:4\d/);
  });

  it("ignores waking a bit earlier (direction) and tiny deviations (minDelta)", () => {
    expect(assessDay(day(15, { firstActivityMin: 5 * 60 }), history).deviations).toEqual([]);
    expect(assessDay(day(15, { firstActivityMin: 405 + 30 }), history).deviations).toEqual([]);
  });

  it("flags several low features together", () => {
    const a = assessDay(day(15, { activityCount: 12, mealReports: 0, adherence: 0.33, wellbeing: -0.6 }), history);
    expect(a.deviations.map((d) => d.key).sort()).toEqual(["activityCount", "adherence", "mealReports", "wellbeing"]);
    expect(a.score).toBeGreaterThan(2.5);
  });

  it("needs a minimum baseline before flagging anything", () => {
    const a = assessDay(day(15, { firstActivityMin: 12 * 60 }), history.slice(0, 3));
    expect(a.deviations).toEqual([]);
    expect(a.baselineDays).toBe(0);
  });

  it("skips features with no data today", () => {
    const a = assessDay(day(15, { activityCount: null, interactions: null }), history);
    expect(a.deviations).toEqual([]);
  });
});

describe("isLateStart", () => {
  const firsts = history.map((d) => d.firstActivityMin);
  it("is late well past the usual start with no activity", () => {
    expect(isLateStart(firsts, 9 * 60, false).late).toBe(true);
  });
  it("is not late shortly after the usual start, or once activity was seen", () => {
    expect(isLateStart(firsts, 7 * 60 + 15, false).late).toBe(false);
    expect(isLateStart(firsts, 11 * 60, true).late).toBe(false);
  });
});
