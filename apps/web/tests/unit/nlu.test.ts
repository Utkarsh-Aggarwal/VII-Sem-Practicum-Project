import { describe, expect, it } from "vitest";
import { classifyIntent, extractSelfReports, scoreWellbeing } from "@/lib/ai/nlu";

describe("classifyIntent", () => {
  it.each([
    ["yes", "AFFIRM"],
    ["Yes I took it", "AFFIRM"],
    ["done", "AFFIRM"],
    ["haan le li", "AFFIRM"],
    ["हाँ, खा लिया", "AFFIRM"],
    ["not yet", "DENY"],
    ["No", "DENY"],
    ["I haven't taken it", "DENY"],
    ["I didn't take it yet", "DENY"],
    ["abhi nahi, baad mein", "DENY"],
    ["अभी नहीं", "DENY"],
  ])("reminder answer %j -> %s", (text, intent) => {
    expect(classifyIntent(text).intent).toBe(intent);
  });

  it.each([
    "I fell in the bathroom",
    "I have chest pain",
    "I can't breathe properly",
    "feeling very dizzy",
    "main gir gaya",
    "सीने में दर्द हो रहा है",
  ])("flags distress: %j", (text) => {
    expect(classifyIntent(text).intent).toBe("DISTRESS");
  });

  it("recognises help requests but not 'no help needed'", () => {
    expect(classifyIntent("please help me").intent).toBe("HELP");
    expect(classifyIntent("call my daughter").intent).toBe("HELP");
    expect(classifyIntent("I don't need any help, thanks").intent).not.toBe("HELP");
  });

  it("doesn't treat long chat with 'yes' as a reminder answer", () => {
    expect(
      classifyIntent("yes and then my grandson came over and we watched the cricket match together all afternoon").intent
    ).toBe("CHAT");
  });

  it("detects greetings and questions", () => {
    expect(classifyIntent("Good morning!").intent).toBe("GREETING");
    expect(classifyIntent("namaste").intent).toBe("GREETING");
    expect(classifyIntent("what day is it today?").intent).toBe("QUESTION");
  });
});

describe("scoreWellbeing", () => {
  it("scores positive and negative statements", () => {
    expect(scoreWellbeing("I feel great today, very happy").label).toBe("positive");
    expect(scoreWellbeing("I feel sad and lonely").label).toBe("negative");
    expect(scoreWellbeing("I went to the shop").label).toBe("neutral");
  });

  it("handles negation in English and Hindi word order", () => {
    expect(scoreWellbeing("I am not good").score).toBeLessThan(0);
    expect(scoreWellbeing("aaj achha nahi lag raha").score).toBeLessThan(0);
  });

  it("raises flags", () => {
    expect(scoreWellbeing("my knee pain is bad").flags).toContain("pain");
    expect(scoreWellbeing("I feel so alone").flags).toContain("lonely");
    expect(scoreWellbeing("couldn't sleep last night").flags).toContain("poor_sleep");
  });
});

describe("extractSelfReports", () => {
  it("pulls structured reports out of chat", () => {
    expect(extractSelfReports("I had my lunch, dal and rice")).toEqual([{ kind: "MEAL", answer: "yes" }]);
    expect(extractSelfReports("I didn't eat breakfast")).toEqual([{ kind: "MEAL", answer: "no" }]);
    expect(extractSelfReports("slept well and went for a walk")).toEqual([
      { kind: "SLEEP", answer: "good" },
      { kind: "ACTIVITY", answer: "yes" },
    ]);
    expect(extractSelfReports("couldn't sleep at all")).toEqual([{ kind: "SLEEP", answer: "poor" }]);
    expect(extractSelfReports("talked to my sister on the phone")).toEqual([{ kind: "SOCIAL", answer: "yes" }]);
    expect(extractSelfReports("the weather is nice")).toEqual([]);
  });
});

describe("illness detection (unwell)", () => {
  it.each([
    "Mujhe khaansi aa rhi hai",
    "Mujhe bukhaar hai",
    "mujhe bukhar hai aur khansi bhi",
    "I have a fever",
    "I've caught a cold",
    "I am feeling sick today",
    "vomiting since morning",
    "my BP is high today",
    "tabiyat kharab hai",
    "sir dard ho raha hai",
    "मुझे बुखार है",
    "खांसी आ रही है",
  ])("flags %j as unwell and negative", (text) => {
    const w = scoreWellbeing(text);
    expect(w.flags).toContain("unwell");
    expect(w.score).toBeLessThan(0);
  });

  it.each([
    "the weather is cold today",
    "the temperature is nice",
    "aaj sardi hai",
    "I had cold coffee",
    "I feel great",
  ])("does not flag %j", (text) => {
    expect(scoreWellbeing(text).flags).not.toContain("unwell");
  });
});

import { detectScript } from "@/lib/ai/nlu";

describe("detectScript", () => {
  it.each([
    ["Mujhe aaj thoda akela lag raha hai", "hinglish"],
    ["Aaj maine garden mein walk kiya", "hinglish"],
    ["haan ji", "hinglish"],
    ["मुझे बुखार है", "devanagari"],
    ["I went for a walk today", "english"],
    ["Hello", "english"],
    ["main road was busy", "english"],
  ])("%j -> %s", (text, script) => {
    expect(detectScript(text)).toBe(script);
  });
});

describe("Hinglish/Hindi activity reports", () => {
  it.each(["Aaj maine garden mein walk kiya", "subah yoga kiya", "walk pe gaya tha", "shaam ko ghoomne gayi", "mandir gaya aaj", "आज सुबह टहलने गया"])(
    "%j -> ACTIVITY yes",
    (text) => {
      expect(extractSelfReports(text)).toContainEqual({ kind: "ACTIVITY", answer: "yes" });
    }
  );
  it("ignores places that are only mentioned", () => {
    expect(extractSelfReports("mujhe park pasand hai")).toEqual([]);
  });
});

describe("headache vs pain", () => {
  it("treats headache / stomach ache as illness only", () => {
    for (const t of ["sir dard ho raha hai", "I have a headache", "pet mein dard hai", "सिर दर्द हो रहा है"]) {
      const w = scoreWellbeing(t);
      expect(w.flags, t).toContain("unwell");
      expect(w.flags, t).not.toContain("pain");
    }
  });
  it("keeps the pain flag when other pain is mentioned too", () => {
    expect(scoreWellbeing("headache and my knee pain is bad").flags).toEqual(expect.arrayContaining(["unwell", "pain"]));
    expect(scoreWellbeing("ghutne mein dard hai").flags).toContain("pain");
  });
});
