// Wellbeing NLU. Rule-based on purpose: reminder answers ("haan, le li") and distress detection
// ("I fell", "chest pain") must work instantly, offline, and predictably — an LLM is only used
// for the open-ended chat reply, never for deciding whether to alert a caregiver.
// Lexicons cover English, Hinglish (romanised Hindi) and Devanagari.

export type Intent = "DISTRESS" | "HELP" | "DENY" | "AFFIRM" | "GREETING" | "QUESTION" | "CHAT";

export type IntentResult = { intent: Intent; confidence: number; matched?: string };

type Pattern = RegExp | string; // strings are substring matches (for Devanagari, where \b doesn't work)

const DISTRESS: Pattern[] = [
  /\b(chest|heart)\s*(pain|hurts?|ache)\b/,
  /\bheart attack\b/,
  /\b(can'?t|cannot|unable to|hard to)\s*breathe?\b/,
  /\bbreathless|short(ness)? of breath\b/,
  /\bi\s*(have\s*)?(fell|fallen|fall down|slipped)\b/,
  /\b(fell|fallen) (down|over)\b/,
  /\bbleeding\b/,
  /\b(feel|feeling|very|so)\s*(dizzy|faint)\b/,
  /\bpassed out|fainted|stroke\b/,
  /\bgir (gaya|gayi|gai|gya)\b/,
  /\bsaans (nahi|nahin|lene mein)\b/,
  /\bseene (mein|me) dard\b/,
  "सीने में दर्द",
  "गिर गया",
  "गिर गई",
  "सांस नहीं",
  "चक्कर",
];

const HELP: Pattern[] = [
  /\bhelp( me)?\b/,
  /\bemergency\b/,
  /\bcall (my )?(son|daughter|family|doctor|ambulance|someone)\b/,
  /\bbachao\b/,
  /\bmadad\b/,
  "मदद",
  "बचाओ",
];

const DENY: Pattern[] = [
  /\bnot yet\b/,
  /\b(no|nope|nah|nahi|nahin)\b/,
  /\b(haven'?t|have not|didn'?t|did not|not taken|forgot|forgotten)\b/,
  /\b(later|after some time|in a while)\b/,
  /\babhi nahi|baad (mein|me)|bhool gay[ai]\b/,
  "नहीं",
  "अभी नहीं",
  "बाद में",
];

const AFFIRM: Pattern[] = [
  /\b(yes|yeah|yep|yup|ya|sure|ok(ay)?|done|finished|completed)\b/,
  /\b(i )?(took|have taken|taken|ate|have eaten|had (it|my)|did it|already did)\b/,
  /\b(haan|haa|han|ji haan|ha ji|haanji|ho gaya|ho gya|le li|le liya|kha liya|kar liya|pi li)\b/,
  "हाँ",
  "हां",
  "हो गया",
  "ले ली",
  "खा लिया",
  "कर लिया",
];

const GREETING: Pattern[] = [
  /^(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|ram ram|jai shri krishna)\b/,
  "नमस्ते",
];

const QUESTION_START = /^(what|when|where|who|why|how|which|can you|could you|will you|do you|is it|kya|kab|kaise|kaun|kahan|kyun)\b/;

function normalise(text: string) {
  return text.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
}

function firstMatch(text: string, patterns: Pattern[]): string | undefined {
  for (const p of patterns) {
    if (typeof p === "string") {
      if (text.includes(p)) return p;
    } else {
      const m = text.match(p);
      if (m) return m[0];
    }
  }
  return undefined;
}

export function wordCount(text: string) {
  return normalise(text).split(" ").filter(Boolean).length;
}

export function classifyIntent(raw: string): IntentResult {
  const text = normalise(raw);
  if (!text) return { intent: "CHAT", confidence: 0 };

  const distress = firstMatch(text, DISTRESS);
  if (distress) return { intent: "DISTRESS", confidence: 0.9, matched: distress };

  const help = firstMatch(text, HELP);
  // "no help needed" / "I don't need help" is not a help request
  if (help && !/\b(no|don'?t|do not|not)\b[^.]*\bhelp\b|\bnahi chahiye\b/.test(text)) {
    return { intent: "HELP", confidence: 0.85, matched: help };
  }

  const words = wordCount(text);
  const short = words <= 8;

  // DENY before AFFIRM: "not yet", "I haven't taken it" contain affirm-ish words.
  const deny = firstMatch(text, DENY);
  if (deny && short) return { intent: "DENY", confidence: words <= 3 ? 0.95 : 0.75, matched: deny };

  const affirm = firstMatch(text, AFFIRM);
  if (affirm && short) return { intent: "AFFIRM", confidence: words <= 3 ? 0.95 : 0.75, matched: affirm };

  const greeting = firstMatch(text, GREETING);
  if (greeting && words <= 6) return { intent: "GREETING", confidence: 0.8, matched: greeting };

  if (text.endsWith("?") || QUESTION_START.test(text)) return { intent: "QUESTION", confidence: 0.7 };

  return { intent: "CHAT", confidence: 0.5 };
}

// --- Wellbeing scoring ---

const POSITIVE: Record<string, number> = {
  great: 0.9, wonderful: 0.9, excellent: 0.9, fantastic: 0.9, happy: 0.8, good: 0.6, fine: 0.4,
  well: 0.4, better: 0.5, nice: 0.5, lovely: 0.7, enjoyed: 0.7, fresh: 0.5, energetic: 0.7,
  relaxed: 0.6, peaceful: 0.6, achha: 0.6, accha: 0.6, badhiya: 0.8, mast: 0.7, theek: 0.3, thik: 0.3,
  khush: 0.8, "अच्छा": 0.6, "बढ़िया": 0.8, "खुश": 0.8, "ठीक": 0.3,
};

const NEGATIVE: Record<string, number> = {
  bad: -0.6, terrible: -0.9, awful: -0.9, sad: -0.7, lonely: -0.8, alone: -0.5, tired: -0.4,
  exhausted: -0.6, weak: -0.5, sick: -0.7, ill: -0.6, unwell: -0.6, pain: -0.7, hurts: -0.6,
  ache: -0.5, dizzy: -0.8, worried: -0.5, anxious: -0.6, scared: -0.7, bored: -0.3, upset: -0.6,
  depressed: -0.9, cry: -0.7, crying: -0.7, miss: -0.3, udaas: -0.7, akela: -0.7, akeli: -0.7,
  dard: -0.7, kamzori: -0.5, bimaar: -0.7, thaka: -0.4, thaki: -0.4, pareshan: -0.6,
  "उदास": -0.7, "अकेला": -0.7, "अकेली": -0.7, "दर्द": -0.7, "बीमार": -0.7, "परेशान": -0.6,
  fever: -0.7, cough: -0.5, coughing: -0.5, vomiting: -0.8, headache: -0.6, nauseous: -0.6,
  bukhar: -0.7, bukhaar: -0.7, khansi: -0.5, khaansi: -0.5, zukam: -0.4, jukam: -0.4, ulti: -0.8,
  "बुखार": -0.7, "खांसी": -0.5, "खाँसी": -0.5, "जुकाम": -0.4, "उल्टी": -0.8,
};

const NEGATORS = new Set(["not", "no", "never", "don't", "dont", "didn't", "isn't", "wasn't", "nahi", "nahin", "na", "नहीं"]);

export type WellbeingFlag =
  | "pain" | "dizzy" | "lonely" | "low_mood" | "tired" | "poor_sleep" | "not_eating" | "fall" | "breathless" | "unwell";

const FLAG_PATTERNS: [WellbeingFlag, Pattern[]][] = [
  ["pain", [/\b(pain|hurts?|ache|aching|dard)\b/, "दर्द"]],
  ["dizzy", [/\b(dizzy|faint|lightheaded|chakkar)\b/, "चक्कर"]],
  ["lonely", [/\b(lonely|alone|no one|nobody|akela|akeli|miss (you|them|my))\b/, "अकेला", "अकेली"]],
  ["low_mood", [/\b(sad|depressed|upset|crying|udaas|hopeless)\b/, "उदास"]],
  ["tired", [/\b(tired|exhausted|weak|no energy|thak|kamzori)\w*\b/]],
  ["poor_sleep", [/\b(couldn'?t sleep|can'?t sleep|didn'?t sleep|no sleep|bad sleep|slept badly|insomnia|neend nahi|neend nahin)\b/, "नींद नहीं"]],
  ["not_eating", [/\b(not hungry|didn'?t eat|haven'?t eaten|skipped (lunch|dinner|breakfast)|no appetite|nahi khaya|bhookh nahi)\b/]],
  ["fall", [/\b(fell|fallen|slipped|gir gay[ai])\b/, "गिर"]],
  ["breathless", [/\b(breathless|can'?t breathe|short of breath|saans)\b/]],
  // Everyday illness: fever, cough, cold, stomach upsets, headache, BP/sugar trouble.
  [
    "unwell",
    [
      /\b(fever|feverish|(have|having|got|running) (a )?(high )?temperature|cough(ing)?|(have|having|caught|got) (a )?cold|flu|sore throat|runny nose|vomit(ing|ed)?|throw(ing)? up|nause(a|ous)|diarrh(o)?ea|loose motions?|headache|migraine|(feel|feeling|am|i'?m) (sick|ill|unwell)|bp (is )?(high|low)|sugar (is )?(high|low))\b/,
      /\b(bukh(a|aa)r|kh(a|aa)ns(i|ee)|z(u|oo)k(a|aa)m|jukam|sardi (lag|ho) ga(yi|i|ya)|sardi[- ]z(u|oo)kaam|ulti|dast|pet (me|mein) dard|sar (me|mein)? ?dard|sir dard|tabiyat (kharab|theek nahi|thik nahi)|tabiyat kharaab|bimar|bimaar)\b/,
      "बुखार",
      "खांसी",
      "खाँसी",
      "जुकाम",
      "उल्टी",
      "सिर दर्द",
      "तबीयत",
      "बीमार",
    ],
  ],
];

export type Wellbeing = { score: number; label: "positive" | "neutral" | "negative"; flags: WellbeingFlag[] };

export function scoreWellbeing(raw: string): Wellbeing {
  const text = normalise(raw);
  const tokens = text.split(/[^\p{L}\p{M}']+/u).filter(Boolean);
  let total = 0;
  let hits = 0;
  tokens.forEach((tok, i) => {
    const w = POSITIVE[tok] ?? NEGATIVE[tok];
    if (w === undefined) return;
    const negated = tokens.slice(Math.max(0, i - 2), i).some((t) => NEGATORS.has(t)) ||
      NEGATORS.has(tokens[i + 1] ?? ""); // Hindi puts the negator after: "achha nahi"
    total += negated ? -w * 0.8 : w;
    hits += 1;
  });
  let flags = FLAG_PATTERNS.filter(([, ps]) => firstMatch(text, ps)).map(([f]) => f);
  // A headache or stomach ache is an illness complaint ("unwell"), not a separate pain emergency —
  // unless they also mention other pain (knee, back, chest, "it hurts"...).
  if (flags.includes("unwell") && flags.includes("pain")) {
    const illnessAche = /\b(sir|sar|pet)\s*(me|mein)?\s*dard\b|\bheadache\b|\bmigraine\b|\bstomach ?ache\b|सिर दर्द|पेट दर्द/;
    const withoutIllnessAches = text.replace(new RegExp(illnessAche.source, "g"), " ");
    if (illnessAche.test(text) && !firstMatch(withoutIllnessAches, FLAG_PATTERNS.find(([f]) => f === "pain")![1])) {
      flags = flags.filter((f) => f !== "pain");
    }
  }
  // Each concerning flag pulls the score down even if no lexicon word matched.
  const flagPenalty = flags.length * 0.25;
  const raw01 = hits ? total / Math.sqrt(hits) : 0;
  const score = Math.max(-1, Math.min(1, raw01 - flagPenalty));
  const label = score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral";
  return { score: Math.round(score * 100) / 100, label, flags };
}

// --- Turning chat into structured self-reports (monitoring from conversation) ---

export type ExtractedReport = { kind: "MEAL" | "SLEEP" | "ACTIVITY" | "SOCIAL" | "FEELING"; answer: string };

const REPORT_RULES: [ExtractedReport, Pattern[]][] = [
  [{ kind: "MEAL", answer: "no" }, [/\b(didn'?t|did not|haven'?t|have not|not) (eat|eaten|had (my )?(breakfast|lunch|dinner|food))\b/, /\b(skipped|missed) (my )?(breakfast|lunch|dinner|meal)\b/, /\b(nahi|nahin) khaya\b/, /\bkhana nahi\b/]],
  [{ kind: "MEAL", answer: "yes" }, [/\b(ate|eaten|had|finished|enjoyed) (my |some |the )?(breakfast|lunch|dinner|food|meal|roti|rice|dal|khichdi|poha|upma|idli|dosa)\b/, /\b(kha liya|khana kha)\w*\b/, "खाना खा"]],
  [{ kind: "SLEEP", answer: "poor" }, [/\b(couldn'?t sleep|can'?t sleep|didn'?t sleep( well)?|slept (badly|poorly)|bad sleep|woke up (many|several) times|insomnia|neend nahi|neend nahin)\b/, "नींद नहीं"]],
  [{ kind: "SLEEP", answer: "good" }, [/\b(slept (well|nicely|soundly|good)|good sleep|good night'?s sleep|achhi neend|acchi neend)\b/, "अच्छी नींद"]],
  [
    { kind: "ACTIVITY", answer: "yes" },
    [
      /\b(went for a walk|took a walk|walked|walking|exercise[ds]?|did yoga|yoga|stretching|gardening|watered the plants|went to the (temple|park|market|mandir)|sair|tahal)\w*\b/,
      // Hinglish: "walk kiya", "yoga kari", "walk pe gaya", "ghoomne gayi", "mandir gaya"
      /\b(walk|yoga|exercise|kasrat|vyayam)\s+(ki|kiya|kari|kar li|kar liya|pe gay[ai]|par gay[ai]|karne gay[ai])\b/,
      /\b(ghoom(ne|a|i)|mandir|park|bazaar|market)\s+(gay[ai]|gaye|gai)\b/,
      "टहल",
      "सैर",
      "योग",
    ],
  ],
  [{ kind: "SOCIAL", answer: "yes" }, [/\b(talked to|spoke to|called|met|visited|video call(ed)?|baat (ki|hui))\b/]],
];

export function extractSelfReports(raw: string): ExtractedReport[] {
  const text = normalise(raw);
  const found: ExtractedReport[] = [];
  const kinds = new Set<string>();
  for (const [report, patterns] of REPORT_RULES) {
    if (kinds.has(report.kind)) continue; // first (more specific / negative) rule per kind wins
    if (firstMatch(text, patterns)) {
      found.push(report);
      kinds.add(report.kind);
    }
  }
  return found;
}

export const MOOD_SCORE: Record<string, number> = { great: 1, okay: 0.3, not_great: -0.6 };

export function selfReportScore(kind: string, answer: string): number {
  const table: Record<string, Record<string, number>> = {
    FEELING: { great: 1, good: 0.7, okay: 0.3, poor: -0.6, not_great: -0.6, bad: -0.8 },
    MEAL: { yes: 0.5, no: -0.5 },
    SLEEP: { good: 0.7, okay: 0.2, poor: -0.6 },
    ACTIVITY: { yes: 0.6, no: -0.2 },
    SOCIAL: { yes: 0.6, no: -0.2 },
  };
  return table[kind]?.[answer] ?? 0;
}

// --- Which language/script the senior just wrote in ---

const HINGLISH_MARKERS = new Set([
  "mujhe", "mujhko", "main", "mai", "mera", "meri", "mere", "hai", "hain", "hoon", "hun", "tha", "thi", "kya", "aaj",
  "kal", "maine", "nahi", "nahin", "raha", "rahi", "rahe", "thoda", "bahut", "aap", "aapka", "accha", "achha", "theek",
  "kaise", "kuch", "lag", "gaya", "gayi", "kiya", "karna", "mein", "bhi", "abhi", "bhai", "ji", "haan",
]);

export function detectScript(raw: string): "devanagari" | "hinglish" | "english" {
  if (/[\u0900-\u097F]/.test(raw)) return "devanagari";
  const words = normalise(raw).split(/[^a-z']+/).filter(Boolean);
  const hits = words.filter((w) => HINGLISH_MARKERS.has(w)).length;
  return hits >= 2 || (words.length <= 3 && hits >= 1 && words.length > 0 && hits / words.length >= 0.5) ? "hinglish" : "english";
}
