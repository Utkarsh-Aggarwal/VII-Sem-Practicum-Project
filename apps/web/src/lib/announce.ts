import type { CheckIn, Elder, Reminder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { synthesize } from "@/lib/ai/speech";
import { asLang, type Lang } from "@/lib/ai/phrases";
import { clipExtension, getClip, storeClip } from "@/lib/voice-audio";

// What the app (and hub) says out loud when a reminder comes due, in the senior's language.
// The caregiver writes the reminder in English ("Blood Pressure Tablet"); the sentence around it is
// localised, so a Hindi speaker hears "रमेशभाई, दवा लेने का समय हो गया है — Blood Pressure Tablet।"

export type AnnounceKind = "reminder" | "nudge";

const TEMPLATES: Record<Lang, Record<string, string>> = {
  en: {
    MEDICINE: "{name}, it's time to take your medicine: {label}. Please take it now, and tell me when you're done.",
    MEAL: "{name}, it's time for {label}. Enjoy your meal, and tell me once you've eaten.",
    SLEEP: "{name}, it's time to get ready for bed. {question}",
    WAKE: "Good morning, {name}! {question}",
    CUSTOM: "{name}, a reminder: {label}. {question}",
    nudge: "Just a gentle reminder, {name}: {label}. Have you done it yet?",
  },
  hi: {
    MEDICINE: "{name}, दवा लेने का समय हो गया है — {label}। अभी ले लीजिए, और लेने के बाद मुझे बता दीजिए।",
    MEAL: "{name}, खाने का समय हो गया है — {label}। आराम से खाइए, और खाने के बाद मुझे बता दीजिए।",
    SLEEP: "{name}, सोने का समय हो गया है। आराम से सोने की तैयारी कीजिए।",
    WAKE: "सुप्रभात, {name}! उठने का समय हो गया है।",
    CUSTOM: "{name}, याद दिला रही हूँ — {label}।",
    nudge: "{name}, एक बार फिर याद दिला रही हूँ — {label}। क्या आपने कर लिया?",
  },
};

export function reminderAnnouncement(
  reminder: Pick<Reminder, "type" | "label" | "question">,
  elder: Pick<Elder, "name" | "language">,
  kind: AnnounceKind = "reminder"
): string {
  const lang = asLang(elder.language);
  const template = kind === "nudge" ? TEMPLATES[lang].nudge : TEMPLATES[lang][reminder.type] ?? TEMPLATES[lang].CUSTOM;
  const vars: Record<string, string> = { name: elder.name.split(" ")[0], label: reminder.label, question: reminder.question };
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// Synthesized announcement audio, reused for the same check-in/kind/language while it's cached.
const g = globalThis as unknown as { ccAnnounceClips?: Map<string, string> };
const clipIds = (g.ccAnnounceClips ??= new Map());

export async function announcementAudioUrl(cacheKey: string, text: string): Promise<string | null> {
  const cached = clipIds.get(cacheKey);
  if (cached && getClip(cached.split(".")[0])) return `/api/voice-audio/${cached}`;
  const speech = await synthesize(text);
  if (!speech) return null;
  const file = `${storeClip(speech.audio, speech.contentType)}.${clipExtension(speech.contentType)}`;
  clipIds.set(cacheKey, file);
  return `/api/voice-audio/${file}`;
}

export type DueAnnouncement = {
  key: string; // `${checkInId}:${kind}` — the app announces each key once
  checkInId: string;
  kind: AnnounceKind;
  type: string;
  label: string;
  text: string;
  audioUrl: string | null;
  scheduledFor: string;
};

// Reminders the senior app should speak right now: dispatched by the scheduler (or already due),
// still unanswered (or answered "not yet"), within the last hour.
export async function dueAnnouncements(elder: Elder, now = new Date(), withAudio = true): Promise<DueAnnouncement[]> {
  const open = await prisma.checkIn.findMany({
    where: {
      elderId: elder.id,
      status: "PENDING",
      scheduledFor: { lte: now, gte: new Date(now.getTime() - 60 * 60_000) },
      OR: [{ response: null }, { response: "not_yet" }],
    },
    include: { reminder: true },
    orderBy: { scheduledFor: "asc" },
  });

  return Promise.all(
    open.map(async (c: CheckIn & { reminder: Reminder }) => {
      const kind: AnnounceKind = c.nudgedAt ? "nudge" : "reminder";
      const text = reminderAnnouncement(c.reminder, elder, kind);
      const key = `${c.id}:${kind}`;
      return {
        key,
        checkInId: c.id,
        kind,
        type: c.reminder.type,
        label: c.reminder.label,
        text,
        audioUrl: withAudio ? await announcementAudioUrl(`${key}:${elder.language}`, text) : null,
        scheduledFor: c.scheduledFor.toISOString(),
      };
    })
  );
}
