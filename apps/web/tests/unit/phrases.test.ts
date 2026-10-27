import { describe, expect, it } from "vitest";
import { asLang, fill, partOfDay, PHRASES, pickPhrase } from "@/lib/ai/phrases";

describe("phrase bank", () => {
  it("has English and Hindi variants for every phrase group", () => {
    for (const [key, bank] of Object.entries(PHRASES)) {
      expect(bank.en.length, key).toBeGreaterThan(0);
      expect(bank.hi.length, key).toBeGreaterThan(0);
    }
  });

  it("fills placeholders", () => {
    expect(fill("Hi {name}, {n} days!", { name: "Ramesh", n: 3 })).toBe("Hi Ramesh, 3 days!");
    expect(pickPhrase("streak", "en", { n: 4 })).toContain("4");
    expect(pickPhrase("helpAck", "hi")).toMatch(/[ऀ-ॿ]/);
  });

  it("keeps every phrase short enough to speak (≤ 2 sentences, ≤ 45 words)", () => {
    for (const bank of Object.values(PHRASES)) {
      for (const p of [...bank.en, ...bank.hi]) {
        expect(p.split(/\s+/).length).toBeLessThanOrEqual(45);
        expect((p.match(/[.!?।]+(\s|$)/g) ?? []).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("normalises language and part of day", () => {
    expect(asLang("hi")).toBe("hi");
    expect(asLang("fr")).toBe("en");
    expect(asLang(null)).toBe("en");
    expect(partOfDay(8)).toBe("morning");
    expect(partOfDay(14)).toBe("afternoon");
    expect(partOfDay(19)).toBe("evening");
  });
});
