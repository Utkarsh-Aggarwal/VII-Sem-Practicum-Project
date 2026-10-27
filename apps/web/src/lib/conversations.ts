import type { Conversation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitCareEvent } from "@/lib/events";
import { complete } from "@/lib/ai/llm";
import { scoreWellbeing, type WellbeingFlag } from "@/lib/ai/nlu";

// Groups companion messages into conversations (a sitting of talking) and writes a short summary
// for caregivers when one ends: on "end" from the app, or after IDLE_MIN of silence (scheduler).

export const IDLE_MIN = 10;

export type ConversationSummary = { summary: string; mood: "good" | "okay" | "low" | "unwell"; concerns: string[] };

// The open conversation for this elder, or a new one if the last went quiet.
export async function currentConversation(elderId: string, opts: { voice?: boolean; now?: Date } = {}): Promise<Conversation> {
  const now = opts.now ?? new Date();
  const open = await prisma.conversation.findFirst({
    where: { elderId, endedAt: null },
    orderBy: { lastActiveAt: "desc" },
  });
  if (open && now.getTime() - open.lastActiveAt.getTime() < IDLE_MIN * 60_000) {
    return prisma.conversation.update({
      where: { id: open.id },
      data: { lastActiveAt: now, ...(opts.voice ? { usedVoice: true } : {}) },
    });
  }
  if (open) await finishConversation(open.id, now);
  return prisma.conversation.create({
    data: { elderId, startedAt: now, lastActiveAt: now, usedVoice: !!opts.voice },
  });
}

const CONCERN_LABEL: Partial<Record<WellbeingFlag, string>> = {
  unwell: "Mentioned feeling unwell",
  pain: "Mentioned pain",
  dizzy: "Felt dizzy",
  breathless: "Trouble breathing",
  fall: "Mentioned a fall",
  lonely: "Feeling lonely",
  low_mood: "Low mood",
  poor_sleep: "Slept poorly",
  not_eating: "Not eating well",
  tired: "Feeling tired",
};

// Deterministic summary used when no LLM is configured or it fails. Pure: unit-tested.
export function ruleSummary(name: string, userMessages: string[]): ConversationSummary {
  const flags = new Set<WellbeingFlag>();
  let total = 0;
  for (const m of userMessages) {
    const w = scoreWellbeing(m);
    w.flags.forEach((f) => flags.add(f));
    total += w.score;
  }
  const avg = userMessages.length ? total / userMessages.length : 0;
  const mood: ConversationSummary["mood"] = flags.has("unwell") || flags.has("pain") || flags.has("dizzy") || flags.has("breathless") || flags.has("fall")
    ? "unwell"
    : avg <= -0.3 || flags.has("lonely") || flags.has("low_mood")
      ? "low"
      : avg >= 0.3
        ? "good"
        : "okay";
  const concerns = [...flags].map((f) => CONCERN_LABEL[f]).filter((c): c is string => !!c);
  const quotes = userMessages.slice(0, 3).map((m) => `“${m.length > 80 ? m.slice(0, 77) + "…" : m}”`);
  const summary = `${name} sent ${userMessages.length} message${userMessages.length === 1 ? "" : "s"}${quotes.length ? `, including ${quotes.join(", ")}` : ""}.${concerns.length ? ` Worth following up: ${concerns.join(", ").toLowerCase()}.` : ""}`;
  return { summary, mood, concerns };
}

export function parseSummaryJson(raw: string | null): ConversationSummary | null {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]);
    const mood = ["good", "okay", "low", "unwell"].includes(data.mood) ? data.mood : "okay";
    const summary = typeof data.summary === "string" ? data.summary.trim() : "";
    const concerns = Array.isArray(data.concerns)
      ? data.concerns.filter((c: unknown): c is string => typeof c === "string" && c.trim() !== "").map((c: string) => c.trim()).slice(0, 5)
      : [];
    return summary ? { summary, mood, concerns } : null;
  } catch {
    return null;
  }
}

async function llmSummary(name: string, transcript: string): Promise<ConversationSummary | null> {
  const raw = await complete(
    [
      {
        role: "system",
        content:
          "You summarise a conversation between an older adult and their AI companion for their adult children (caregivers). " +
          "The conversation may be in Hindi, Hinglish or English; always write the summary in clear, simple English. " +
          'Reply with JSON only: {"summary": string, "mood": "good"|"okay"|"low"|"unwell", "concerns": string[]}. ' +
          "summary: 2-3 short sentences about what they talked about, how they seemed, and anything they asked for. " +
          "concerns: short phrases a caregiver should follow up on (health complaints, loneliness, missed medicine, requests); empty array if none. " +
          "Only use what is in the transcript. Do not invent details. Do not give medical advice.",
      },
      { role: "user", content: `Senior's name: ${name}\n\nTranscript:\n${transcript}` },
    ],
    { maxTokens: 700, temperature: 0.2, json: true }
  );
  return parseSummaryJson(raw);
}

export async function finishConversation(id: string, now = new Date()) {
  const convo = await prisma.conversation.findUnique({
    where: { id },
    include: { elder: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!convo || convo.endedAt) return convo;

  const userMessages = convo.messages.filter((m) => m.role === "user").map((m) => m.content);
  if (!userMessages.length) {
    await prisma.conversation.delete({ where: { id } });
    return null;
  }

  // Claim it first so a concurrent scheduler tick doesn't summarise it twice.
  const claimed = await prisma.conversation.updateMany({ where: { id, endedAt: null }, data: { endedAt: now } });
  if (!claimed.count) return convo;

  const name = convo.elder.name.split(" ")[0];
  const transcript = convo.messages.map((m) => `${m.role === "user" ? name : "Companion"}: ${m.content}`).join("\n");
  const fromLlm = await llmSummary(name, transcript);
  const rules = ruleSummary(name, userMessages);
  const result = fromLlm ?? rules;
  // Health complaints always show as "unwell" to caregivers, whatever the model judged.
  if (rules.mood === "unwell") result.mood = "unwell";

  const updated = await prisma.conversation.update({
    where: { id },
    data: {
      summary: result.summary,
      mood: result.mood,
      concerns: JSON.stringify(result.concerns),
      summarizedBy: fromLlm ? "llm" : "rules",
    },
  });
  emitCareEvent({ elderId: convo.elderId, type: "conversation.summarized", payload: { id, mood: result.mood } });
  return updated;
}

// Called by the app when the senior leaves the talk screen.
export async function endCurrentConversation(elderId: string, now = new Date()) {
  const open = await prisma.conversation.findFirst({ where: { elderId, endedAt: null }, orderBy: { lastActiveAt: "desc" } });
  return open ? finishConversation(open.id, now) : null;
}

// Scheduler: summarise conversations that have gone quiet.
export async function closeIdleConversations(now = new Date()) {
  const idle = await prisma.conversation.findMany({
    where: { endedAt: null, lastActiveAt: { lt: new Date(now.getTime() - IDLE_MIN * 60_000) } },
    select: { id: true },
  });
  for (const c of idle) await finishConversation(c.id, now);
  return idle.length;
}
