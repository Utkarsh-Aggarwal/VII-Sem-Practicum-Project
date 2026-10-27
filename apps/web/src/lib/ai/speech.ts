import { elevenLabsConfigured, elevenSpeak, elevenTranscribe } from "@/lib/ai/elevenlabs";

// Speech pipeline for the senior app's hold-to-talk and the hub: a recorded clip becomes text (STT)
// and the reply becomes audio (TTS). ElevenLabs is used when ELEVENLABS_API_KEY is set (best Hindi);
// otherwise any OpenAI-compatible audio endpoint (Groq Whisper for STT).

function sttConfig() {
  const base = process.env.STT_BASE_URL || (process.env.GROQ_API_KEY ? "https://api.groq.com/openai/v1" : "");
  const key = process.env.STT_API_KEY || process.env.GROQ_API_KEY || "";
  if (!base) return null;
  return { base: base.replace(/\/$/, ""), key, model: process.env.STT_MODEL || "whisper-large-v3-turbo" };
}

function ttsConfig() {
  const base = process.env.TTS_BASE_URL;
  if (!base || !process.env.TTS_MODEL) return null;
  return {
    base: base.replace(/\/$/, ""),
    key: process.env.TTS_API_KEY || "",
    model: process.env.TTS_MODEL,
    voice: process.env.TTS_VOICE || "alloy",
  };
}

export const speechStatus = () => ({
  stt: elevenLabsConfigured() || !!sttConfig(),
  tts: elevenLabsConfigured() || !!ttsConfig(),
  provider: elevenLabsConfigured() ? "elevenlabs" : null,
});

export async function transcribe(audio: Blob, language?: string, filename?: string): Promise<string | null> {
  if (elevenLabsConfigured()) {
    const out = await elevenTranscribe(audio, filename);
    if (out) return out.text;
  }
  const cfg = sttConfig();
  if (!cfg) return null;
  const form = new FormData();
  form.append("file", audio, filename ?? "clip.wav");
  form.append("model", cfg.model);
  if (language) form.append("language", language);
  try {
    const res = await fetch(`${cfg.base}/audio/transcriptions`, {
      method: "POST",
      headers: cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {},
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data.text as string | undefined)?.trim() || null;
  } catch (err) {
    console.warn("[stt] failed:", (err as Error).message);
    return null;
  }
}

export async function synthesize(text: string): Promise<{ audio: ArrayBuffer; contentType: string } | null> {
  if (elevenLabsConfigured()) {
    const out = await elevenSpeak(text);
    if (out) return out;
  }
  const cfg = ttsConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.base}/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) },
      body: JSON.stringify({ model: cfg.model, voice: cfg.voice, input: text, response_format: "wav" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    return { audio: await res.arrayBuffer(), contentType: res.headers.get("content-type") || "audio/wav" };
  } catch (err) {
    console.warn("[tts] failed:", (err as Error).message);
    return null;
  }
}
