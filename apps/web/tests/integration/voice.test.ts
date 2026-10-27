import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { call, makeCaregiver, makeDevice, makeElder, prisma, req, resetDb } from "../helpers";
import { fetchMock } from "../setup";
import * as voice from "@/app/api/mobile/voice/route";
import * as voiceEnd from "@/app/api/mobile/voice/end/route";
import * as voiceAudio from "@/app/api/voice-audio/[id]/route";
import * as conversationsRoute from "@/app/api/elders/[id]/conversations/route";
import * as mobileChat from "@/app/api/mobile/chat/route";
import { closeIdleConversations, IDLE_MIN } from "@/lib/conversations";
import { companionTurn } from "@/lib/ai/companion";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });

// Fakes the three external services: ElevenLabs STT, Groq LLM, ElevenLabs TTS.
function fakeServices(transcript: string, llmReply = "Aap theek hain, Ramesh ji. Thoda aaram kijiye.") {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/speech-to-text")) return json({ text: transcript, language_code: "hin" });
    if (url.includes("/text-to-speech/")) return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "content-type": "audio/mpeg" } });
    if (url.includes("chat/completions")) {
      return json({ choices: [{ message: { content: llmReply } }] });
    }
    return json({});
  });
}

function voiceRequest(token: string, bytes = 2000) {
  const form = new FormData();
  form.append("audio", new File([new Uint8Array(bytes)], "clip.m4a", { type: "audio/m4a" }));
  return req("POST", "/api/mobile/voice", { token, raw: form });
}

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("ELEVENLABS_API_KEY", "xi");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "voice1");
  vi.stubEnv("GROQ_API_KEY", "gk");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/mobile/voice (hold-to-talk)", () => {
  it("transcribes, replies, and returns playable ElevenLabs audio", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    const { token } = await makeDevice(elder.id, "APP");
    fakeServices("Aaj maine garden mein walk kiya");

    const res = await call(voice.POST, voiceRequest(token));
    expect(res.status).toBe(200);
    expect(res.json.transcript).toBe("Aaj maine garden mein walk kiya");
    expect(res.json.reply).toBe("Aap theek hain, Ramesh ji. Thoda aaram kijiye.");
    expect(res.json.audioUrl).toMatch(/^\/api\/voice-audio\/[\w-]+\.mp3$/);

    const id = res.json.audioUrl.split("/").pop();
    const audio = await voiceAudio.GET(req("GET", res.json.audioUrl), { params: Promise.resolve({ id }) });
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));

    const msgs = await prisma.chatMessage.findMany({ where: { elderId: elder.id }, orderBy: { createdAt: "asc" } });
    expect(msgs.map((m) => [m.role, m.viaVoice])).toEqual([["user", true], ["assistant", true]]);
    expect(msgs[0].conversationId).toBe(res.json.conversationId);
    const convo = await prisma.conversation.findUniqueOrThrow({ where: { id: res.json.conversationId } });
    expect(convo.usedVoice).toBe(true);
    // a walk mentioned by voice is logged as a self-report too
    expect(await prisma.selfReport.count({ where: { elderId: elder.id, kind: "ACTIVITY" } })).toBe(1);
  });

  it("raises the health alert from spoken Hindi without asking the LLM", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    const { token } = await makeDevice(elder.id, "APP");
    fakeServices("मुझे बुखार है");
    const res = await call(voice.POST, voiceRequest(token));
    expect(res.json.alertRaised).toBe(true);
    expect(res.json.reply).toMatch(/परिवार/); // spoken in Hindi -> answered in Hindi
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("chat/completions"))).toBe(false);
    expect(await prisma.alert.count({ where: { kind: "HEALTH_CONCERN" } })).toBe(1);
  });

  it("asks to repeat when nothing was heard", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id, { language: "hi" });
    const { token } = await makeDevice(elder.id, "APP");
    fakeServices("");
    const res = await call(voice.POST, voiceRequest(token));
    expect(res.json.transcript).toBe("");
    expect(res.json.reply).toMatch(/[ऀ-ॿ]/);
    expect(await prisma.chatMessage.count()).toBe(0);
  });

  it("returns no audio (app uses its own voice) when TTS fails", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    const { token } = await makeDevice(elder.id, "APP");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/speech-to-text")) return json({ text: "hello" });
      if (url.includes("chat/completions")) return json({ choices: [{ message: { content: "Hello Ramesh!" } }] });
      return new Response("tts down", { status: 500 });
    });
    const res = await call(voice.POST, voiceRequest(token));
    expect(res.status).toBe(200);
    expect(res.json.reply).toBe("Hello Ramesh!");
    expect(res.json.audioUrl).toBeNull();
  });

  it("returns 503 when no speech-to-text is configured", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    const { token } = await makeDevice(elder.id, "APP");
    const res = await call(voice.POST, voiceRequest(token));
    expect(res.status).toBe(503);
  });

  it("validates input and auth", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    const { token } = await makeDevice(elder.id, "APP");
    expect((await call(voice.POST, voiceRequest("ccd_wrong"))).status).toBe(401);
    expect((await call(voice.POST, req("POST", "/api/mobile/voice", { token, raw: new FormData() }))).status).toBe(400);
    expect((await call(voice.POST, voiceRequest(token, 11 * 1024 * 1024))).status).toBe(413);
  });

  it("expired or unknown audio ids return 404", async () => {
    const res = await voiceAudio.GET(req("GET", "/api/voice-audio/nope.mp3"), { params: Promise.resolve({ id: "nope.mp3" }) });
    expect(res.status).toBe(404);
  });
});

describe("conversations and caregiver summaries", () => {
  it("groups messages <10 min apart, splits after silence, and summarises with the LLM", async () => {
    const { caregiver, token: cgToken } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    fakeServices("", "Lovely, tell me more.");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T10:00:00Z"));
    const a = await companionTurn({ elder, text: "I watched cricket", source: "app" });
    vi.setSystemTime(new Date("2026-10-24T10:05:00Z"));
    const b = await companionTurn({ elder, text: "India won!", source: "app" });
    expect(b.conversationId).toBe(a.conversationId);

    // LLM summary for the first conversation, triggered when the next one starts after silence.
    fetchMock.mockImplementation(async () =>
      json({ choices: [{ message: { content: '{"summary":"Ramesh talked happily about India winning the cricket.","mood":"good","concerns":[]}' } }] })
    );
    vi.setSystemTime(new Date(Date.parse("2026-10-24T10:05:00Z") + (IDLE_MIN + 1) * 60_000));
    const c = await companionTurn({ elder, text: "Hello again", source: "app" });
    expect(c.conversationId).not.toBe(a.conversationId);

    const first = await prisma.conversation.findUniqueOrThrow({ where: { id: a.conversationId! } });
    expect(first.endedAt).not.toBeNull();
    expect(first).toMatchObject({ summary: "Ramesh talked happily about India winning the cricket.", mood: "good", summarizedBy: "llm" });

    const res = await call(conversationsRoute.GET, req("GET", `/api/elders/${elder.id}/conversations`, { cookie: cgToken }), { id: elder.id });
    expect(res.status).toBe(200);
    expect(res.json.conversations).toHaveLength(2);
    const summarised = res.json.conversations.find((x: { id: string }) => x.id === a.conversationId);
    expect(summarised.concerns).toEqual([]);
    expect(summarised.messages.map((m: { content: string }) => m.content)).toContain("India won!");
  });

  it("marks the mood unwell when illness was mentioned, even if the model says otherwise", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    const { token } = await makeDevice(elder.id, "APP");
    fetchMock.mockImplementation(async () =>
      json({ choices: [{ message: { content: '{"summary":"Felt lonely and had a fever.","mood":"low","concerns":["fever"]}' } }] })
    );
    await call(mobileChat.POST, req("POST", "/api/mobile/chat", { token, body: { text: "Mujhe bukhaar hai" } }));
    await call(voiceEnd.POST, req("POST", "/api/mobile/voice/end", { token, body: {} }));
    expect(await prisma.conversation.findFirstOrThrow()).toMatchObject({ mood: "unwell", summarizedBy: "llm" });
  });

  it("falls back to a rule-based summary when the LLM is unavailable", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    const { token } = await makeDevice(elder.id, "APP");
    await call(mobileChat.POST, req("POST", "/api/mobile/chat", { token, body: { text: "Mujhe khaansi aa rhi hai" } }));
    const end = await call(voiceEnd.POST, req("POST", "/api/mobile/voice/end", { token, body: {} }));
    expect(end.json.ended).toBe(true);
    const convo = await prisma.conversation.findFirstOrThrow({ where: { elderId: elder.id } });
    expect(convo).toMatchObject({ mood: "unwell", summarizedBy: "rules" });
    expect(JSON.parse(convo.concerns!)).toContain("Mentioned feeling unwell");
  });

  it("the scheduler summarises conversations that went quiet, exactly once", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T10:00:00Z"));
    await companionTurn({ elder, text: "Good morning", source: "app" });
    expect(await closeIdleConversations(new Date("2026-10-24T10:05:00Z"))).toBe(0);
    expect(await closeIdleConversations(new Date("2026-10-24T10:30:00Z"))).toBe(1);
    expect(await closeIdleConversations(new Date("2026-10-24T10:31:00Z"))).toBe(0);
    expect((await prisma.conversation.findFirstOrThrow()).summary).toContain("Good morning");
  });

  it("dashboard previews never create conversations; caregivers of other families can't read them", async () => {
    const { caregiver } = await makeCaregiver();
    const { token: strangerToken } = await makeCaregiver("Stranger");
    const elder = await makeElder(caregiver.id);
    await companionTurn({ elder, text: "hi", source: "dashboard", persist: false });
    expect(await prisma.conversation.count()).toBe(0);
    const res = await call(conversationsRoute.GET, req("GET", "/x", { cookie: strangerToken }), { id: elder.id });
    expect(res.status).toBe(404);
  });
});

describe("speech-to-text language hint", () => {
  it("never forces English (that makes Whisper translate Hindi speech)", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id, { language: "en" });
    const { token } = await makeDevice(elder.id, "APP");
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("transcriptions") ? json({ text: "मुझे अकेलापन लग रहा है" }) : json({ choices: [{ message: { content: "Main yahin hoon." } }] })
    );
    await call(voice.POST, voiceRequest(token));
    const sttCall = fetchMock.mock.calls.find(([u]) => String(u).includes("transcriptions"))!;
    expect((sttCall[1]!.body as FormData).get("language")).toBeNull();
  });

  it("hints Hindi for Hindi-language elders", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id, { language: "hi" });
    const { token } = await makeDevice(elder.id, "APP");
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("transcriptions") ? json({ text: "नमस्ते" }) : json({ choices: [{ message: { content: "नमस्ते!" } }] })
    );
    await call(voice.POST, voiceRequest(token));
    const sttCall = fetchMock.mock.calls.find(([u]) => String(u).includes("transcriptions"))!;
    expect((sttCall[1]!.body as FormData).get("language")).toBe("hi");
  });
});
