import { describe, expect, it } from "vitest";
import { minutesOfDay, reminderInstant, startOfZonedDay, zonedDayKey, zonedTimeToUtc } from "@/lib/time";

describe("timezone helpers", () => {
  it("converts Kolkata wall-clock time to UTC", () => {
    expect(zonedTimeToUtc(2026, 10, 23, 8, 0, "Asia/Kolkata").toISOString()).toBe("2026-10-23T02:30:00.000Z");
  });

  it("computes the reminder instant on the elder's local day, even across UTC midnight", () => {
    // 20:00 UTC on the 22nd is already 01:30 on the 23rd in Kolkata.
    const now = new Date("2026-10-22T20:00:00Z");
    expect(zonedDayKey(now, "Asia/Kolkata")).toBe("2026-10-23");
    expect(reminderInstant("08:00", now, "Asia/Kolkata").toISOString()).toBe("2026-10-23T02:30:00.000Z");
    expect(startOfZonedDay(now, "Asia/Kolkata").toISOString()).toBe("2026-10-22T18:30:00.000Z");
  });

  it("handles DST zones", () => {
    // New York is UTC-4 in October and UTC-5 in December.
    expect(zonedTimeToUtc(2026, 10, 23, 8, 0, "America/New_York").toISOString()).toBe("2026-10-23T12:00:00.000Z");
    expect(zonedTimeToUtc(2026, 12, 1, 8, 0, "America/New_York").toISOString()).toBe("2026-12-01T13:00:00.000Z");
  });

  it("reports minutes after local midnight", () => {
    expect(minutesOfDay(new Date("2026-10-23T02:30:00Z"), "Asia/Kolkata")).toBe(480);
  });
});
