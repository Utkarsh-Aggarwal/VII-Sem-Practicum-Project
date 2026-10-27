// Bilingual (English / Hindi) phrase bank for everything the system says without an LLM:
// reminder prompts, confirmations, encouragement, and the offline companion.
// Following GUARDIAN's user requirements: short, warm, varied, and ending on a positive note.

export type Lang = "en" | "hi";

export const asLang = (l: string | null | undefined): Lang => (l === "hi" ? "hi" : "en");

type Bank = Record<Lang, string[]>;

export const PHRASES = {
  confirmYes: {
    en: ["Wonderful, thank you for letting me know!", "Great job, {name}!", "Lovely, that's noted.", "Perfect — well done!", "Thank you, {name}. You're doing great."],
    hi: ["बहुत बढ़िया, बताने के लिए धन्यवाद!", "शाबाश, {name}!", "बहुत अच्छा, मैंने नोट कर लिया।", "वाह, बहुत अच्छे!"],
  },
  confirmNotYet: {
    en: ["No problem, I'll remind you again a little later.", "That's okay — I'll check back soon.", "Alright, take your time. I'll ask again shortly."],
    hi: ["कोई बात नहीं, मैं थोड़ी देर में फिर याद दिला दूँगी।", "ठीक है, आराम से। मैं फिर पूछूँगी।"],
  },
  streak: {
    en: ["That's {n} days in a row — fantastic!", "{n} days straight. Your family will be proud!", "A {n}-day streak — keep it up!"],
    hi: ["लगातार {n} दिन — कमाल है!", "{n} दिन से लगातार, बहुत बढ़िया!"],
  },
  nudge: {
    en: ["Just a gentle reminder: {question}", "Checking in again — {question}"],
    hi: ["बस एक हल्की सी याद: {question}", "फिर से पूछ रही हूँ — {question}"],
  },
  helpAck: {
    en: ["I've let your family know right away. Stay where you are — help is on the way.", "I've alerted your family. Please stay calm and sit down if you can — someone will contact you soon."],
    hi: ["मैंने तुरंत आपके परिवार को बता दिया है। जहाँ हैं वहीं रहिए — मदद आ रही है।", "मैंने आपके परिवार को सूचित कर दिया है। शांत रहिए, कोई जल्द ही संपर्क करेगा।"],
  },
  greeting: {
    en: ["Hello {name}! It's lovely to hear from you.", "Hi {name}! How is your {part} going?", "Good {part}, {name}! I'm happy you're here."],
    hi: ["नमस्ते {name}! आपसे बात करके अच्छा लगा।", "नमस्ते {name}! आपका दिन कैसा जा रहा है?"],
  },
  unwell: {
    en: ["I'm sorry you're not feeling well, {name}. I've let your family know — please rest and drink some water.", "Get well soon, {name}. I've told your family so they can check on you; rest and keep sipping water."],
    hi: ["आपकी तबीयत ठीक नहीं है, यह सुनकर दुख हुआ, {name}। मैंने परिवार को बता दिया है — आराम कीजिए और पानी पीते रहिए।", "जल्दी ठीक हो जाइए, {name}। मैंने परिवार को बता दिया है, वे आपसे बात करेंगे।"],
  },
  positive: {
    en: ["That's so good to hear, {name}!", "How lovely — that made me smile.", "Wonderful! Moments like that matter.", "I'm really glad, {name}. Keep it up!"],
    hi: ["यह सुनकर बहुत अच्छा लगा, {name}!", "वाह, बहुत बढ़िया!", "बहुत खुशी हुई सुनकर।"],
  },
  negative: {
    en: ["I'm sorry you're feeling that way, {name}. A glass of water and a short rest might help — I'm here with you.", "That sounds hard. Maybe call someone you love today — they'd be happy to hear from you.", "Thank you for telling me. Let's take it slowly today; you're not alone."],
    hi: ["यह सुनकर दुख हुआ, {name}। थोड़ा पानी पीकर आराम कर लीजिए — मैं यहीं हूँ।", "आज किसी अपने से फ़ोन पर बात कर लीजिए, उन्हें अच्छा लगेगा।", "बताने के लिए धन्यवाद। आज आराम से चलिए, आप अकेले नहीं हैं।"],
  },
  activity: {
    en: ["Good job getting some movement in today!", "A walk is the best medicine — well done!", "That's great for your health. Proud of you!"],
    hi: ["आज थोड़ा चलना-फिरना बहुत अच्छा किया!", "सैर सबसे अच्छी दवा है — शाबाश!"],
  },
  meal: {
    en: ["Good — a proper meal keeps your energy up!", "Lovely, I hope it was tasty!"],
    hi: ["अच्छा है — सही खाना ताकत देता है!", "बढ़िया, उम्मीद है स्वादिष्ट था!"],
  },
  question: {
    en: ["That's a good question, {name} — maybe ask your family when they call. Meanwhile, how is your day going?", "I'm not completely sure about that one, so let's ask your family later. Tell me, what are you up to today?"],
    hi: ["अच्छा सवाल है, {name} — जब परिवार फ़ोन करे, उनसे पूछिए। तब तक बताइए, आज क्या कर रहे हैं?"],
  },
  chat: {
    en: ["Tell me more, {name} — I'm listening.", "That's interesting! What else is on your mind today?", "I enjoy our chats. What would make today a good day for you?", "Thanks for sharing that with me. Have you had some water recently?"],
    hi: ["और बताइए, {name} — मैं सुन रही हूँ।", "दिलचस्प! आज और क्या चल रहा है?", "आपसे बात करना अच्छा लगता है। आज का दिन अच्छा बनाने के लिए क्या करें?"],
  },
} satisfies Record<string, Bank>;

export type PhraseKey = keyof typeof PHRASES;

export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

// Picks a phrase that wasn't used recently (variety requirement), falling back to any phrase.
export function pickPhrase(
  key: PhraseKey,
  lang: Lang,
  vars: Record<string, string | number> = {},
  recent: string[] = []
): string {
  const options = PHRASES[key][lang].map((t) => fill(t, vars));
  const fresh = options.filter((o) => !recent.includes(o));
  const pool = fresh.length ? fresh : options;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function partOfDay(hour: number, lang: Lang = "en") {
  if (lang === "hi") return hour < 12 ? "सुबह" : hour < 17 ? "दोपहर" : "शाम";
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}
