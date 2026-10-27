import { describe, expect, it } from "vitest";
import { familyStatus } from "@/lib/dashboard";
import { formatTime12, initials, timeAgo } from "@/lib/format";

const base = { openAlerts: [], missedLabels: [], lastTalkMood: null, done: 2, total: 3 };

describe("familyStatus (plain-language status line)", () => {
  it("is all good with no problems", () => {
    expect(familyStatus(base)).toEqual({ tone: "good", label: "All good today", detail: "2 of 3 reminders done" });
    expect(familyStatus({ ...base, total: 0, done: 0 }).detail).toBe("No reminders today");
  });
  it("urgent alerts come first", () => {
    const s = familyStatus({ ...base, openAlerts: [{ severity: "warning", title: "Missed: Lunch" }, { severity: "critical", title: "Pressed help" }] });
    expect(s).toEqual({ tone: "bad", label: "Needs you now", detail: "Pressed help" });
  });
  it("warnings, then missed reminders, then mood", () => {
    expect(familyStatus({ ...base, openAlerts: [{ severity: "warning", title: "Not feeling well" }] })).toMatchObject({ tone: "warn", detail: "Not feeling well" });
    expect(familyStatus({ ...base, missedLabels: ["Lunch", "BP tablet", "Dinner"] })).toMatchObject({ tone: "warn", detail: "Missed Lunch and BP tablet" });
    expect(familyStatus({ ...base, lastTalkMood: "unwell" })).toMatchObject({ tone: "warn", label: "Check in", detail: "Mentioned feeling unwell" });
    expect(familyStatus({ ...base, lastTalkMood: "low" }).detail).toBe("Seemed low in their last chat");
  });
  it("ignores info-only alerts", () => {
    expect(familyStatus({ ...base, openAlerts: [{ severity: "info", title: "Hub offline" }] }).tone).toBe("good");
  });
});

describe("format helpers", () => {
  it("formats 12-hour times", () => {
    expect(formatTime12("00:05")).toBe("12:05 AM");
    expect(formatTime12("08:00")).toBe("8:00 AM");
    expect(formatTime12("12:30")).toBe("12:30 PM");
    expect(formatTime12("22:00")).toBe("10:00 PM");
  });
  it("relative times and initials", () => {
    const now = Date.parse("2026-10-24T12:00:00Z");
    expect(timeAgo("2026-10-24T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-24T11:15:00Z", now)).toBe("45 min ago");
    expect(timeAgo("2026-10-23T11:00:00Z", now)).toBe("yesterday");
    expect(initials("Rameshbhai Shah")).toBe("RS");
  });
});
