import type { Elder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitCareEvent } from "@/lib/events";
import { raiseAlert, raiseOrMergeAlert } from "@/lib/alerts";
import { currentConversation } from "@/lib/conversations";
import { answerCheckIn, findOpenCheckIn } from "@/lib/checkins";
import { startOfZonedDay, zonedDayKey, zonedParts } from "@/lib/time";
import { complete, type LlmMessage } from "@/lib/ai/llm";
import { classifyIntent, detectScript, extractSelfReports, scoreWellbeing, selfReportScore, type Intent } from "@/lib/ai/nlu";
import { asLang, partOfDay, pickPhrase, type Lang, type PhraseKey } from "@/lib/ai/phrases";

// The AI companion. Order of precedence for every message:
//   1. Safety: distress / help -> critical alert + fixed reassuring reply (never left to the LLM)
//   2. Reminder answers: "yes"/"not yet" while a reminder is open -> answer the check-in
//   3. Monitoring: pull meal/sleep/activity self-reports and wellbeing out of what was said
//   4. Conversation: LLM reply grounded in the senior's profile, shaped to be short and varied,
//      or the offline phrase bank when no LLM is configured / it fails.

export type CompanionSource = "app" | "hub" | "dashboard";

export type CompanionResult = {
  reply: string;
  conversationId?: string | null;
  intent: Intent;
  wellbeing: ReturnType<typeof scoreWellbeing>;
  answeredCheckInId?: string;
  alertRaised?: string;
  selfReports: { kind: string; answer: string }[];
  usedLlm: boolean;
};

const MAX_WORDS = 45;

// --- Reply shaping (pure, unit-tested) ---

export function shapeReply(text: string, maxSentences = 2, maxWords = MAX_WORDS): string {
  let t = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`~]+/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/^\s*(assistant|companion)\s*:\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Split into sentences (also on the Devanagari danda).
  const sentences = t.match(/[^.!?।]+[.!?।]+|[^.!?।]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [t];
  t = sentences.slice(0, maxSentences).join(" ");
  const words = t.split(" ");
  if (words.length > maxWords) {
    t = words.slice(0, maxWords).join(" ").replace(/[,;:\-–]$/, "") + "…";
  }
  // Models occasionally drop the final full stop; it sounds abrupt when read aloud.
  if (t && !/[.!?।…]$/.test(t)) t += /[\u0900-\u097F]$/.test(t) ? "।" : ".";
  return t;
}

function tokens(s: string) {
  return new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
}

export function similarity(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function isRepetitive(reply: string, recentReplies: string[], threshold = 0.6) {
  return recentReplies.some((r) => similarity(reply, r) >= threshold);
}

// --- Prompt ---

function languageHint(text: string): LlmMessage[] {
  const script = detectScript(text);
  if (script === "hinglish") return [{ role: "system", content: "Their next message is in Hinglish. Reply in simple Hinglish: Hindi words written in English (Latin) letters, like \"Aap kaise hain?\". Do not use Devanagari script." }];
  if (script === "devanagari") return [{ role: "system", content: "Their next message is in Hindi. Reply in simple Hindi (Devanagari script)." }];
  return [];
}

export type CompanionContext = {
  name: string;
  lang: Lang;
  localTime: string;
  partOfDay: string;
  profile: string | null;
  todayReminders: { label: string; time: string; status: string }[];
  indoor?: { temperature?: number; humidity?: number };
  recentReports: string[];
};

export function buildSystemPrompt(ctx: CompanionContext): string {
  const reminders = ctx.todayReminders.length
    ? ctx.todayReminders.map((r) => `- ${r.time} ${r.label}: ${r.status.toLowerCase().replace(/_/g, " ")}`).join("\n")
    : "- none today";
  const indoor = ctx.indoor && (ctx.indoor.temperature !== undefined || ctx.indoor.humidity !== undefined)
    ? `Indoor sensors right now: ${ctx.indoor.temperature !== undefined ? `${ctx.indoor.temperature.toFixed(0)}°C` : ""}${ctx.indoor.humidity !== undefined ? `, ${ctx.indoor.humidity.toFixed(0)}% humidity` : ""}.`
    : "No indoor sensor data right now.";

  return [
    `You are Saathi, a warm companion chatting with ${ctx.name}, an older adult living at home. Your replies are also read aloud, so write the way a kind person speaks.`,
    `Reply ${ctx.lang === "hi" ? "in simple Hindi (Devanagari script)" : "in simple English"} by default. If ${ctx.name} writes in Hinglish (Hindi in English letters), reply in simple Hinglish; if they write in Devanagari, reply in Devanagari.`,
    "",
    "Rules:",
    `- At most 2 short sentences (under ${MAX_WORDS} words). Plain words, no lists, no emojis, no markdown.`,
    "- Be warm and respectful. Use their name sometimes, not every time.",
    "- Never repeat a phrase you used in the recent conversation; vary greetings and compliments.",
    "- Always end on a positive or encouraging note, or a gentle question that keeps them talking.",
    "- Do not give medical diagnoses or change medication advice. For health worries, suggest telling family or their doctor.",
    "- Do not invent facts (outdoor weather, news, appointments). If you don't know, say so kindly and steer back to them.",
    "- If they mention eating, sleep, a walk or talking to someone, respond warmly to it.",
    "- Always respond to their latest message; earlier messages are only background.",
    "- Mention the indoor temperature only if they talk about heat, cold or the weather.",
    "",
    `It is ${ctx.partOfDay} (${ctx.localTime} their time). ${indoor}`,
    `About ${ctx.name} (from family): ${ctx.profile?.trim() || "no notes yet."}`,
    "Today's reminders:",
    reminders,
    ctx.recentReports.length ? `Recent check-ins from ${ctx.name}: ${ctx.recentReports.join("; ")}.` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

async function loadContext(elder: Elder, now: Date): Promise<CompanionContext> {
  const lang = asLang(elder.language);
  const p = zonedParts(now, elder.timezone);
  const dayStart = startOfZonedDay(now, elder.timezone);
  const [checkIns, temp, hum, reports, moods] = await Promise.all([
    prisma.checkIn.findMany({
      where: { elderId: elder.id, scheduledFor: { gte: dayStart } },
      include: { reminder: true },
      orderBy: { scheduledFor: "asc" },
    }),
    prisma.sensorReading.findFirst({
      where: { elderId: elder.id, kind: "temperature", createdAt: { gte: new Date(now.getTime() - 3600_000) } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sensorReading.findFirst({
      where: { elderId: elder.id, kind: "humidity", createdAt: { gte: new Date(now.getTime() - 3600_000) } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.selfReport.findMany({
      where: { elderId: elder.id, createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.moodLog.findFirst({ where: { elderId: elder.id, createdAt: { gte: dayStart } }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    name: elder.name.split(" ")[0],
    lang,
    localTime: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
    partOfDay: partOfDay(p.hour),
    profile: elder.profile,
    todayReminders: checkIns.map((c) => ({ label: c.reminder.label, time: c.reminder.time, status: c.status })),
    indoor: { temperature: temp?.value, humidity: hum?.value },
    recentReports: [
      ...(moods ? [`mood today: ${moods.mood.replace("_", " ")}`] : []),
      ...reports.map((r) => `${r.kind.toLowerCase()}: ${r.answer}`),
    ],
  };
}

function offlineReply(
  intent: Intent,
  wellbeing: ReturnType<typeof scoreWellbeing>,
  reports: { kind: string }[],
  vars: Record<string, string>,
  lang: Lang,
  recent: string[]
) {
  let key: PhraseKey = "chat";
  if (wellbeing.flags.includes("unwell")) key = "unwell";
  else if (intent === "GREETING") key = "greeting";
  else if (wellbeing.label === "negative") key = "negative";
  else if (reports.some((r) => r.kind === "ACTIVITY")) key = "activity";
  else if (reports.some((r) => r.kind === "MEAL")) key = "meal";
  else if (wellbeing.label === "positive") key = "positive";
  else if (intent === "QUESTION") key = "question";
  return pickPhrase(key, lang, vars, recent);
}

export async function companionTurn(opts: {
  elder: Elder;
  text: string;
  source: CompanionSource;
  persist?: boolean; // false for the dashboard's "try the companion" preview
  viaVoice?: boolean; // the senior spoke (STT) rather than typed
  now?: Date;
}): Promise<CompanionResult> {
  const { elder, source } = opts;
  const text = opts.text.trim().slice(0, 1000);
  const now = opts.now ?? new Date();
  const persist = opts.persist ?? true;
  const lang = asLang(elder.language);
  const name = elder.name.split(" ")[0];
  const day = zonedDayKey(now, elder.timezone);

  const { intent } = classifyIntent(text);
  const wellbeing = scoreWellbeing(text);

  const history = await prisma.chatMessage.findMany({
    where: { elderId: elder.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  history.reverse();
  const recentReplies = history.filter((m) => m.role === "assistant").map((m) => m.content).slice(-6);

  // Messages from the senior's app/hub are grouped into conversations for caregiver summaries.
  const conversationId =
    persist && source !== "dashboard" ? (await currentConversation(elder.id, { voice: opts.viaVoice, now })).id : null;

  if (persist) {
    const msg = await prisma.chatMessage.create({
      data: { elderId: elder.id, conversationId, role: "user", content: text, source, intent, viaVoice: !!opts.viaVoice },
    });
    emitCareEvent({ elderId: elder.id, type: "chat.message", payload: msg });
  }

  const result: CompanionResult = { reply: "", intent, wellbeing, selfReports: [], usedLlm: false };

  // 1. Safety first.
  if (intent === "DISTRESS" || intent === "HELP") {
    if (persist) {
      const alert = await raiseAlert({
        elderId: elder.id,
        kind: intent === "DISTRESS" ? "DISTRESS" : "HELP_REQUEST",
        severity: "critical",
        title: intent === "DISTRESS" ? "Possible emergency" : "Asked for help",
        message: `${name} said: “${text.slice(0, 160)}”`,
        data: { source, flags: wellbeing.flags },
        dedupeKey: `${intent.toLowerCase()}:${elder.id}:${Math.floor(now.getTime() / 600_000)}`,
      });
      result.alertRaised = alert?.id;
    }
    result.reply = pickPhrase("helpAck", lang, { name }, recentReplies);
    return finish(result);
  }

  // 1b. Feeling ill: fixed caring reply that tells them the family knows (alert raised below).
  const unwell = wellbeing.flags.includes("unwell");

  // 2. Answering an open reminder.
  if (intent === "AFFIRM" || intent === "DENY") {
    const open = await findOpenCheckIn(elder.id, now);
    if (open && persist) {
      const { checkIn, message } = await answerCheckIn({
        checkIn: open,
        elder,
        answer: intent === "AFFIRM" ? "yes" : "no",
        channel: source === "hub" ? "voice" : "chat",
        transcript: text,
        now,
      });
      result.answeredCheckInId = checkIn.id;
      result.reply = message;
      return finish(result);
    }
  }

  // 3. Monitoring signals from free conversation.
  const extracted = extractSelfReports(text);
  if (persist) {
    for (const r of extracted) {
      const report = await prisma.selfReport.create({
        data: { elderId: elder.id, kind: r.kind, answer: r.answer, text, score: selfReportScore(r.kind, r.answer), source: "chat" },
      });
      emitCareEvent({ elderId: elder.id, type: "selfreport.created", payload: report });
    }
    if (wellbeing.flags.includes("unwell")) {
      // Every complaint today ends up in one open alert, so the family sees all of them.
      const quote = text.slice(0, 160).replace(/[\s.!?।]+$/, "");
      const healthMessage = (quotes: string[]) =>
        `${name} told the companion: ${quotes.map((q) => `“${q}”`).join(", then ")}. Maybe give them a call.`;
      const alert = await raiseOrMergeAlert(
        {
          elderId: elder.id,
          kind: "HEALTH_CONCERN",
          severity: "warning",
          title: "Not feeling well",
          message: healthMessage([quote]),
          data: { flags: wellbeing.flags, quotes: [quote] },
          dedupeKey: `unwell:${elder.id}:${day}`,
        },
        (existing) => {
          let quotes: string[] = [];
          try {
            quotes = (JSON.parse(existing.data ?? "{}").quotes as string[] | undefined) ?? [];
          } catch {}
          if (!quotes.length) quotes = [existing.message.match(/“(.*?)”/)?.[1] ?? ""].filter(Boolean);
          quotes = [...quotes.filter((q) => q !== quote), quote].slice(-4);
          return { message: healthMessage(quotes), data: { flags: wellbeing.flags, quotes } };
        }
      );
      result.alertRaised = alert?.id;
    }
    const concerning = wellbeing.flags.filter((f) => ["pain", "dizzy", "lonely", "low_mood", "breathless"].includes(f));
    // Illness alone is already covered by HEALTH_CONCERN above; only add a mood alert for other worries.
    const onlyUnwell = wellbeing.flags.includes("unwell") && !concerning.length;
    if (!onlyUnwell && (wellbeing.score <= -0.5 || concerning.length)) {
      const alert = await raiseAlert({
        elderId: elder.id,
        kind: "LOW_MOOD",
        severity: concerning.some((f) => f === "pain" || f === "dizzy" || f === "breathless") ? "critical" : "warning",
        title: concerning.length ? `Mentioned: ${concerning.join(", ").replace(/_/g, " ")}` : "Seems low today",
        message: `${name} told the companion: “${text.slice(0, 160)}”`,
        data: { score: wellbeing.score, flags: wellbeing.flags },
        dedupeKey: `lowmood:${elder.id}:${day}:${concerning.sort().join(",") || "score"}`,
      });
      result.alertRaised = alert?.id;
    }
  }
  result.selfReports = extracted;

  // 4. Conversation.
  const ctx = await loadContext(elder, now);
  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt(ctx) },
    ...history.slice(-10).map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content })),
    // The chat history can pull the model back into English; state the language of *this* message.
    ...languageHint(text),
    { role: "user", content: text },
  ];
  // Generous token budget: reasoning models spend part of it thinking; shapeReply() keeps the answer short.
  const llm = unwell ? null : await complete(messages, { maxTokens: 400, temperature: 0.85 });
  const vars = { name, part: ctx.partOfDay };

  if (llm) {
    let shaped = shapeReply(llm);
    if (shaped && isRepetitive(shaped, recentReplies)) {
      // One retry asking for something fresh before giving up on the model.
      const retry = await complete(
        [...messages.slice(0, -1), { role: "system", content: `Do not repeat yourself. Avoid saying anything like: "${shaped}". Say something different and specific to their message.` }, messages[messages.length - 1]],
        { maxTokens: 400, temperature: 1 }
      );
      shaped = retry ? shapeReply(retry) : "";
    }
    if (shaped && !isRepetitive(shaped, recentReplies)) {
      result.reply = shaped;
      result.usedLlm = true;
    }
  }
  if (!result.reply) {
    // Built-in phrases follow the language they just used (Devanagari -> Hindi phrases).
    const replyLang: Lang = detectScript(text) === "devanagari" ? "hi" : lang;
    result.reply = offlineReply(intent, wellbeing, extracted, { ...vars, part: partOfDay(zonedParts(now, elder.timezone).hour, replyLang) }, replyLang, recentReplies);
  }
  return finish(result);

  async function finish(r: CompanionResult) {
    r.conversationId = conversationId;
    if (persist) {
      const msg = await prisma.chatMessage.create({
        data: { elderId: elder.id, conversationId, role: "assistant", content: r.reply, source, viaVoice: !!opts.viaVoice },
      });
      emitCareEvent({ elderId: elder.id, type: "chat.message", payload: msg });
    }
    return r;
  }
}

// Short compliment after a self-report from the app (e.g. a "yes" to "Did you go for a walk?").
export function encouragementFor(kind: string, answer: string, elder: Pick<Elder, "name" | "language">): string | null {
  const lang = asLang(elder.language);
  const name = elder.name.split(" ")[0];
  const score = selfReportScore(kind, answer);
  if (kind === "ACTIVITY" && answer === "yes") return pickPhrase("activity", lang, { name });
  if (kind === "MEAL" && answer === "yes") return pickPhrase("meal", lang, { name });
  if (score >= 0.5) return pickPhrase("positive", lang, { name });
  if (score <= -0.5) return pickPhrase("negative", lang, { name });
  return null;
}
