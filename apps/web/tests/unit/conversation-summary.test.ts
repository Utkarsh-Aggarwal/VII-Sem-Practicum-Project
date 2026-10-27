import { describe, expect, it } from "vitest";
import { parseSummaryJson, ruleSummary } from "@/lib/conversations";

describe("ruleSummary (no-LLM fallback)", () => {
  it("flags illness and lists concerns", () => {
    const s = ruleSummary("Ramesh", ["Mujhe bukhaar hai", "aur khaansi bhi"]);
    expect(s.mood).toBe("unwell");
    expect(s.concerns).toContain("Mentioned feeling unwell");
    expect(s.summary).toContain("Ramesh sent 2 messages");
    expect(s.summary).toContain("“Mujhe bukhaar hai”");
  });

  it("detects low and good moods", () => {
    expect(ruleSummary("R", ["I feel so lonely today"]).mood).toBe("low");
    expect(ruleSummary("R", ["I feel great, very happy"]).mood).toBe("good");
    expect(ruleSummary("R", ["I watched TV"]).mood).toBe("okay");
    expect(ruleSummary("R", ["I watched TV"]).concerns).toEqual([]);
  });

  it("truncates long quotes", () => {
    const s = ruleSummary("R", ["a".repeat(200)]);
    expect(s.summary).toContain("…”");
  });
});

describe("parseSummaryJson (LLM output)", () => {
  it("parses JSON, even wrapped in text", () => {
    expect(parseSummaryJson('Here: {"summary":"Talked about cricket.","mood":"good","concerns":[]}')).toEqual({
      summary: "Talked about cricket.",
      mood: "good",
      concerns: [],
    });
  });

  it("sanitises mood and concerns", () => {
    expect(parseSummaryJson('{"summary":"x","mood":"ecstatic","concerns":["fever"," ",3,"cough"]}')).toEqual({
      summary: "x",
      mood: "okay",
      concerns: ["fever", "cough"],
    });
  });

  it("rejects missing/invalid output", () => {
    expect(parseSummaryJson(null)).toBeNull();
    expect(parseSummaryJson("no json here")).toBeNull();
    expect(parseSummaryJson('{"summary": ""}')).toBeNull();
    expect(parseSummaryJson("{broken")).toBeNull();
  });
});
