import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { call, freezeTime, makeCaregiver, makeDevice, makeElder, makeReminder, prisma, req, resetDb } from "../helpers";
import { fetchMock } from "../setup";
import * as due from "@/app/api/mobile/due/route";
import * as prefs from "@/app/api/mobile/preferences/route";
import { reminderAnnouncement } from "@/lib/announce";
import { tick } from "@/lib/scheduler";

beforeEach(resetDb);
afterEach(() => vi.unstubAllEnvs());

describe("reminderAnnouncement", () => {
  const elder = { name: "Ramesh Shah", language: "en" };
  const med = { type: "MEDICINE", label: "BP tablet", question: "Did you take it?" };
  it("speaks reminders naturally in English and Hindi", () => {
    expect(reminderAnnouncement(med, elder)).toBe("Ramesh, it's time to take your medicine: BP tablet. Please take it now, and tell me when you're done.");
    expect(reminderAnnouncement(med, { ...elder, language: "hi" })).toBe("Ramesh, दवा लेने का समय हो गया है — BP tablet। अभी ले लीजिए, और लेने के बाद मुझे बता दीजिए।");
    expect(reminderAnnouncement({ ...med, type: "MEAL", label: "Lunch" }, { ...elder, language: "hi" })).toContain("खाने का समय");
    expect(reminderAnnouncement(med, elder, "nudge")).toBe("Just a gentle reminder, Ramesh: BP tablet. Have you done it yet?");
  });
});

describe("GET /api/mobile/due (app speaks reminders by itself)", () => {
  it("returns nothing before the time, then the announcement with ElevenLabs audio, then the nudge", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "v1");
    fetchMock.mockImplementation(async () => new Response(new Uint8Array([7, 7]), { headers: { "content-type": "audio/mpeg" } }));
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id, { language: "hi" });
    await makeReminder(elder.id, { time: "08:00", label: "BP tablet" });
    const { token } = await makeDevice(elder.id, "APP");

    freezeTime("2026-10-23T02:29:00Z", vi); // 07:59 IST
    expect((await call(due.GET, req("GET", "/api/mobile/due", { token }))).json.due).toEqual([]);

    freezeTime("2026-10-23T02:31:00Z", vi); // 08:01 IST
    await tick();
    const res = await call(due.GET, req("GET", "/api/mobile/due", { token }));
    expect(res.json.due).toHaveLength(1);
    const a = res.json.due[0];
    expect(a).toMatchObject({ kind: "reminder", label: "BP tablet", type: "MEDICINE" });
    expect(a.key).toBe(`${a.checkInId}:reminder`);
    expect(a.text).toContain("दवा लेने का समय");
    expect(a.audioUrl).toMatch(/^\/api\/voice-audio\/.+\.mp3$/);

    // Polling again re-uses the cached audio instead of paying for TTS again.
    const ttsCalls = fetchMock.mock.calls.length;
    const again = await call(due.GET, req("GET", "/api/mobile/due", { token }));
    expect(again.json.due[0].audioUrl).toBe(a.audioUrl);
    expect(fetchMock.mock.calls.length).toBe(ttsCalls);

    freezeTime("2026-10-23T02:47:00Z", vi); // 08:17 → nudge
    await tick();
    const nudge = (await call(due.GET, req("GET", "/api/mobile/due", { token }))).json.due[0];
    expect(nudge.kind).toBe("nudge");
    expect(nudge.key).toBe(`${a.checkInId}:nudge`);
    expect(nudge.text).toContain("एक बार फिर");
  });

  it("stops announcing once answered, and stays quiet after 'not yet' until the nudge", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    await makeReminder(elder.id, { time: "08:00" });
    const { token } = await makeDevice(elder.id, "APP");
    freezeTime("2026-10-23T02:31:00Z", vi);
    await tick();
    const [a] = (await call(due.GET, req("GET", "/api/mobile/due", { token }))).json.due;
    expect(a.audioUrl).toBeNull(); // no TTS configured -> app uses its own voice
    await prisma.checkIn.update({ where: { id: a.checkInId }, data: { status: "DONE_ON_TIME", response: "yes" } });
    expect((await call(due.GET, req("GET", "/api/mobile/due", { token }))).json.due).toEqual([]);
  });

  it("requires a paired device", async () => {
    expect((await call(due.GET, req("GET", "/api/mobile/due"))).status).toBe(401);
  });
});

describe("POST /api/mobile/preferences", () => {
  it("saves the language chosen in the app", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id, { language: "en" });
    const { token } = await makeDevice(elder.id, "APP");
    const res = await call(prefs.POST, req("POST", "/api/mobile/preferences", { token, body: { language: "hi" } }));
    expect(res.json.language).toBe("hi");
    expect((await prisma.elder.findUniqueOrThrow({ where: { id: elder.id } })).language).toBe("hi");
    expect((await call(prefs.POST, req("POST", "/api/mobile/preferences", { token, body: { language: "fr" } }))).status).toBe(400);
  });
});
