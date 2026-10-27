import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VOICE_ID, elevenSpeak, elevenTranscribe, resolveVoiceId } from "@/lib/ai/elevenlabs";
import { speechStatus, synthesize, transcribe } from "@/lib/ai/speech";
import { fetchMock } from "../setup";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as { ccElevenVoice?: string }).ccElevenVoice;
});

describe("ElevenLabs", () => {
  it("does nothing without an API key", async () => {
    expect(await elevenTranscribe(new Blob(["x"]))).toBeNull();
    expect(await elevenSpeak("hi")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("transcribes with Scribe v2 and auto-detected language", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi");
    fetchMock.mockResolvedValueOnce(json({ text: " मुझे बुखार है ", language_code: "hin" }));
    expect(await elevenTranscribe(new Blob(["audio"]), "clip.m4a")).toEqual({ text: "मुझे बुखार है", language: "hin" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((init!.headers as Record<string, string>)["xi-api-key"]).toBe("xi");
    const form = init!.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("language_code")).toBeNull();
    expect((form.get("file") as File).name).toBe("clip.m4a");
  });

  it("prefers a Hindi voice from the account and caches it", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi");
    fetchMock.mockResolvedValueOnce(
      json({ voices: [{ voice_id: "en1", name: "Rachel", labels: { accent: "american" } }, { voice_id: "hi1", name: "Priya", labels: { language: "hi", accent: "indian" } }] })
    );
    expect(await resolveVoiceId()).toBe("hi1");
    expect(await resolveVoiceId()).toBe("hi1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default voice when the key can't list voices", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(json({ detail: { message: "missing the permission voices_read" } }, 401));
    expect(await resolveVoiceId()).toBe(DEFAULT_VOICE_ID);
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { "content-type": "audio/mpeg" } }));
    expect(await elevenSpeak("नमस्ते")).not.toBeNull();
    expect(String(fetchMock.mock.calls[1][0])).toContain(`/text-to-speech/${DEFAULT_VOICE_ID}`);
  });

  it("uses ELEVENLABS_VOICE_ID when set and returns mp3 audio", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "voice123");
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([9, 9]), { headers: { "content-type": "audio/mpeg" } }));
    const out = await elevenSpeak("नमस्ते");
    expect(out?.contentType).toBe("audio/mpeg");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice123?output_format=mp3_44100_128");
    expect(JSON.parse(init!.body as string)).toMatchObject({ text: "नमस्ते", model_id: "eleven_multilingual_v2" });
  });

  it("speech pipeline prefers ElevenLabs and falls back to Groq Whisper if it fails", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi");
    vi.stubEnv("GROQ_API_KEY", "gk");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(speechStatus()).toMatchObject({ stt: true, tts: true, provider: "elevenlabs" });
    fetchMock
      .mockResolvedValueOnce(new Response("quota exceeded", { status: 401 }))
      .mockResolvedValueOnce(json({ text: "haan" }));
    expect(await transcribe(new Blob(["x"]), "hi", "clip.m4a")).toBe("haan");
    expect(String(fetchMock.mock.calls[1][0])).toContain("api.groq.com");
  });

  it("synthesize returns null when ElevenLabs fails and nothing else is configured", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "v");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 500 }));
    expect(await synthesize("hi")).toBeNull();
  });
});
