import { describe, expect, it } from "vitest";
import { buildSystemPrompt, isRepetitive, shapeReply } from "@/lib/ai/companion";
import { pickPhrase, PHRASES } from "@/lib/ai/phrases";

describe("shapeReply", () => {
  it("keeps at most two sentences and strips markdown", () => {
    const out = shapeReply("**Hello Ramesh!** That sounds lovely. Tell me more. And another thing.");
    expect(out).toBe("Hello Ramesh! That sounds lovely.");
  });
  it("caps the word count", () => {
    const long = Array.from({ length: 80 }, () => "word").join(" ") + ".";
    expect(shapeReply(long).split(" ").length).toBeLessThanOrEqual(45);
  });
  it("splits Hindi sentences on the danda", () => {
    expect(shapeReply("नमस्ते! आप कैसे हैं? आज मौसम अच्छा है। बहुत बढ़िया।")).toBe("नमस्ते! आप कैसे हैं?");
  });
  it("drops a leading speaker label", () => {
    expect(shapeReply("Assistant: Good morning!")).toBe("Good morning!");
  });
});

describe("variety", () => {
  it("detects near-repeats of recent replies", () => {
    expect(isRepetitive("Great job, Ramesh! Well done today.", ["Great job Ramesh, well done today!"])).toBe(true);
    expect(isRepetitive("Would you like to hear about cricket?", ["Great job Ramesh, well done today!"])).toBe(false);
  });
  it("avoids phrases used recently when alternatives exist", () => {
    const all = PHRASES.confirmYes.en.map((t) => t.replace("{name}", "Ramesh"));
    const recent = all.slice(1);
    for (let i = 0; i < 20; i++) expect(pickPhrase("confirmYes", "en", { name: "Ramesh" }, recent)).toBe(all[0]);
  });
});

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt({
    name: "Ramesh",
    lang: "hi",
    localTime: "08:15",
    partOfDay: "morning",
    profile: "Loves cricket",
    todayReminders: [{ label: "BP tablet", time: "08:00", status: "PENDING" }],
    indoor: { temperature: 27.4, humidity: 60 },
    recentReports: ["sleep: good"],
  });
  it("grounds the model in the profile, schedule and sensors", () => {
    expect(prompt).toContain("Loves cricket");
    expect(prompt).toContain("08:00 BP tablet: pending");
    expect(prompt).toContain("27°C");
    expect(prompt).toContain("Hindi");
    expect(prompt).toContain("sleep: good");
  });
  it("enforces brevity and safety rules", () => {
    expect(prompt).toMatch(/At most 2 short sentences/);
    expect(prompt).toMatch(/medical diagnoses/);
    expect(prompt).toMatch(/Do not invent facts/);
  });
});

describe("shapeReply punctuation", () => {
  it("adds a missing final full stop (or danda for Hindi)", () => {
    expect(shapeReply("A garden walk is good for your health")).toBe("A garden walk is good for your health.");
    expect(shapeReply("Did you enjoy it?")).toBe("Did you enjoy it?");
    expect(shapeReply("आप कैसे हैं")).toBe("आप कैसे हैं।");
  });
});
