import { afterEach, describe, expect, it, vi } from "vitest";
import { speechStatus, synthesize, transcribe } from "@/lib/ai/speech";
import { isExpoPushToken, sendPush } from "@/lib/push";
import { fetchMock } from "../setup";

afterEach(() => vi.unstubAllEnvs());

describe("speech-to-text / text-to-speech", () => {
  it("reports nothing configured by default", async () => {
    expect(speechStatus()).toEqual({ stt: false, tts: false, provider: null });
    expect(await transcribe(new Blob(["x"]))).toBeNull();
    expect(await synthesize("hello")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Groq Whisper when a Groq key is present", async () => {
    vi.stubEnv("GROQ_API_KEY", "gk");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ text: " haan le li " })));
    expect(await transcribe(new Blob(["wav"]), "hi")).toBe("haan le li");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const form = init!.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("hi");
  });

  it("returns audio from an OpenAI-compatible TTS endpoint", async () => {
    vi.stubEnv("TTS_BASE_URL", "http://tts.local/v1");
    vi.stubEnv("TTS_MODEL", "tts-1");
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/wav" } }));
    const out = await synthesize("Good morning");
    expect(out?.contentType).toBe("audio/wav");
    expect(new Uint8Array(out!.audio)).toEqual(new Uint8Array([1, 2, 3]));
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://tts.local/v1/audio/speech");
  });

  it("returns null when the provider fails", async () => {
    vi.stubEnv("GROQ_API_KEY", "gk");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 500 }));
    expect(await transcribe(new Blob(["x"]))).toBeNull();
  });
});

describe("Expo push", () => {
  it("recognises Expo push tokens", () => {
    expect(isExpoPushToken("ExponentPushToken[abc]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[abc]")).toBe(true);
    expect(isExpoPushToken("fcm-raw-token")).toBe(false);
    expect(isExpoPushToken(null)).toBe(false);
  });

  it("sends only valid tokens, in one batch", async () => {
    await sendPush([
      { to: "ExponentPushToken[a]", title: "T", body: "B" },
      { to: "junk", title: "T", body: "B" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ to: "ExponentPushToken[a]", title: "T", sound: "default" });
  });

  it("does nothing without valid tokens and never throws", async () => {
    await sendPush([{ to: "junk", title: "T", body: "B" }]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(sendPush([{ to: "ExponentPushToken[a]", title: "T", body: "B" }])).resolves.toBeUndefined();
  });
});
