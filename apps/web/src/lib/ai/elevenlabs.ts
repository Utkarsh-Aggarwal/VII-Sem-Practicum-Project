// ElevenLabs speech: Scribe for speech-to-text (handles Hindi, Hinglish and English in one model)
// and multilingual text-to-speech for a natural Hindi/English voice.
// Docs: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
//       https://elevenlabs.io/docs/api-reference/text-to-speech/convert

const API = "https://api.elevenlabs.io/v1";

export function elevenLabsConfigured(env: NodeJS.ProcessEnv = process.env) {
  return !!env.ELEVENLABS_API_KEY;
}

function key() {
  return process.env.ELEVENLABS_API_KEY ?? "";
}

export async function elevenTranscribe(audio: Blob, filename = "clip.m4a"): Promise<{ text: string; language: string | null } | null> {
  if (!elevenLabsConfigured()) return null;
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
  // No language_code: Scribe auto-detects, so Hindi, Hinglish and English all work in one session.
  form.append("tag_audio_events", "false");
  try {
    const res = await fetch(`${API}/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": key() },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return { text: String(data.text ?? "").trim(), language: data.language_code ?? null };
  } catch (err) {
    console.warn("[elevenlabs:stt] failed:", (err as Error).message);
    return null;
  }
}

type Voice = { voice_id: string; name?: string; category?: string; labels?: Record<string, string> };

// "Sarah": a free premade voice that speaks Hindi well via eleven_multilingual_v2. Used when the key
// can't list voices (keys without the voices_read permission) or the account has none.
export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

const g = globalThis as unknown as { ccElevenVoice?: string };

// ELEVENLABS_VOICE_ID wins; otherwise pick a voice from the account, preferring Hindi / Indian ones.
export async function resolveVoiceId(): Promise<string | null> {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  if (g.ccElevenVoice) return g.ccElevenVoice;
  try {
    const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const voices = ((await res.json()).voices ?? []) as Voice[];
    const text = (v: Voice) => `${v.name ?? ""} ${Object.values(v.labels ?? {}).join(" ")}`.toLowerCase();
    const pick =
      voices.find((v) => /\bhindi\b|\bhi\b/.test(text(v))) ??
      voices.find((v) => /indian/.test(text(v))) ??
      voices.find((v) => /female/.test(text(v)) && v.category === "premade") ??
      voices[0];
    if (!pick) return (g.ccElevenVoice = DEFAULT_VOICE_ID);
    g.ccElevenVoice = pick.voice_id;
    console.log(`[elevenlabs] using voice "${pick.name}" (${pick.voice_id}); set ELEVENLABS_VOICE_ID to choose another`);
    return pick.voice_id;
  } catch (err) {
    console.warn("[elevenlabs:voices] can't list voices, using the default voice:", (err as Error).message.slice(0, 160));
    return (g.ccElevenVoice = DEFAULT_VOICE_ID);
  }
}

export async function elevenSpeak(text: string): Promise<{ audio: ArrayBuffer; contentType: string } | null> {
  if (!elevenLabsConfigured()) return null;
  const voiceId = await resolveVoiceId();
  if (!voiceId) return null;
  try {
    const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2",
        // A touch slower and steadier than default: easier for older listeners.
        voice_settings: { stability: 0.6, similarity_boost: 0.75, speed: 0.92 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    return { audio: await res.arrayBuffer(), contentType: res.headers.get("content-type") || "audio/mpeg" };
  } catch (err) {
    console.warn("[elevenlabs:tts] failed:", (err as Error).message);
    return null;
  }
}
