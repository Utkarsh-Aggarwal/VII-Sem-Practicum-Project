import type { Elder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitCareEvent } from "@/lib/events";
import { raiseAlert } from "@/lib/alerts";
import { startOfZonedDay, zonedDayKey, zonedParts } from "@/lib/time";
import { selfReportScore } from "@/lib/ai/nlu";
import { encouragementFor } from "@/lib/ai/companion";
import { asLang, type Lang } from "@/lib/ai/phrases";

// Short wellbeing prompts the senior app (and hub) ask through the day, GUARDIAN-style.

export const SELF_REPORT_KINDS = ["FEELING", "MEAL", "SLEEP", "ACTIVITY", "SOCIAL"] as const;
export type SelfReportKind = (typeof SELF_REPORT_KINDS)[number];

type PromptDef = {
  kind: SelfReportKind;
  fromHour: number;
  question: Record<Lang, string>;
  options: { answer: string; emoji: string; label: Record<Lang, string> }[];
};

const YES_NO = (yes: string, no: string, yesHi: string, noHi: string) => [
  { answer: "yes", emoji: "👍", label: { en: yes, hi: yesHi } },
  { answer: "no", emoji: "✋", label: { en: no, hi: noHi } },
];

export const PROMPTS: PromptDef[] = [
  {
    kind: "SLEEP",
    fromHour: 5,
    question: { en: "How did you sleep last night?", hi: "कल रात नींद कैसी आई?" },
    options: [
      { answer: "good", emoji: "😴", label: { en: "Well", hi: "अच्छी" } },
      { answer: "okay", emoji: "🙂", label: { en: "Okay", hi: "ठीक" } },
      { answer: "poor", emoji: "😣", label: { en: "Badly", hi: "खराब" } },
    ],
  },
  {
    kind: "MEAL",
    fromHour: 13,
    question: { en: "Have you eaten a proper meal today?", hi: "क्या आज आपने ठीक से खाना खाया?" },
    options: YES_NO("Yes", "Not yet", "हाँ", "अभी नहीं"),
  },
  {
    kind: "ACTIVITY",
    fromHour: 16,
    question: { en: "Did you go for a walk or move around today?", hi: "क्या आज आप टहलने गए या थोड़ा चले-फिरे?" },
    options: YES_NO("Yes", "No", "हाँ", "नहीं"),
  },
  {
    kind: "SOCIAL",
    fromHour: 18,
    question: { en: "Did you talk to a friend or family today?", hi: "क्या आज किसी दोस्त या परिवार से बात हुई?" },
    options: YES_NO("Yes", "No", "हाँ", "नहीं"),
  },
];

export async function pendingPrompts(elder: Elder, now = new Date()) {
  const lang = asLang(elder.language);
  const { hour } = zonedParts(now, elder.timezone);
  const answered = await prisma.selfReport.findMany({
    where: { elderId: elder.id, createdAt: { gte: startOfZonedDay(now, elder.timezone) } },
    select: { kind: true },
  });
  const done = new Set(answered.map((a) => a.kind));
  return PROMPTS.filter((p) => hour >= p.fromHour && !done.has(p.kind)).map((p) => ({
    kind: p.kind,
    question: p.question[lang],
    options: p.options.map((o) => ({ answer: o.answer, emoji: o.emoji, label: o.label[lang] })),
  }));
}

export async function recordSelfReport(
  elder: Elder,
  input: { kind: SelfReportKind; answer: string; text?: string; source: "app" | "hub" }
) {
  const score = selfReportScore(input.kind, input.answer);
  const report = await prisma.selfReport.create({
    data: { elderId: elder.id, kind: input.kind, answer: input.answer, text: input.text ?? null, score, source: input.source },
  });
  emitCareEvent({ elderId: elder.id, type: "selfreport.created", payload: report });

  // Two low self-reports in one day is worth a gentle heads-up to the family.
  if (score <= -0.5) {
    const dayStart = startOfZonedDay(new Date(), elder.timezone);
    const lows = await prisma.selfReport.count({ where: { elderId: elder.id, createdAt: { gte: dayStart }, score: { lte: -0.5 } } });
    const lowMood = await prisma.moodLog.count({ where: { elderId: elder.id, createdAt: { gte: dayStart }, mood: "not_great" } });
    if (lows + lowMood >= 2) {
      await raiseAlert({
        elderId: elder.id,
        kind: "LOW_MOOD",
        severity: "warning",
        title: "Not having a great day",
        message: `${elder.name.split(" ")[0]} reported several low check-ins today (latest: ${input.kind.toLowerCase()} — ${input.answer}).`,
        dedupeKey: `lowreports:${elder.id}:${zonedDayKey(new Date(), elder.timezone)}`,
      });
    }
  }

  return { report, message: encouragementFor(input.kind, input.answer, elder) };
}
