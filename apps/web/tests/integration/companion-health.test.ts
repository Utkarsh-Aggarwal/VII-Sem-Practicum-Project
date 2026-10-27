import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMock } from "../setup";
import { makeCaregiver, makeElder, prisma, resetDb } from "../helpers";
import { companionTurn } from "@/lib/ai/companion";

describe("companion: health complaints", () => {
  beforeEach(resetDb);

  it("replies with care and alerts the family once per day (Hinglish, as tested on the phone)", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);

    const first = await companionTurn({ elder, text: "Mujhe khaansi aa rhi hai", source: "app" });
    expect(first.wellbeing.flags).toContain("unwell");
    expect(first.reply).toMatch(/not feeling well|Get well soon/);
    expect(first.reply).toMatch(/family/);

    const second = await companionTurn({ elder, text: "Mujhe bukhaar hai", source: "app" });
    expect(second.reply).toMatch(/not feeling well|Get well soon/);

    const alerts = await prisma.alert.findMany({ where: { elderId: elder.id } });
    expect(alerts).toHaveLength(1); // one alert per day, and no extra "low mood" alert
    expect(alerts[0]).toMatchObject({ kind: "HEALTH_CONCERN", severity: "warning", title: "Not feeling well" });
    // ...but it lists every complaint, so the dashboard matches what was said
    expect(alerts[0].message).toBe("Ramesh told the companion: “Mujhe khaansi aa rhi hai”, then “Mujhe bukhaar hai”. Maybe give them a call.");
  });

  it("raises a fresh alert for new complaints after the family handled the first one", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    await companionTurn({ elder, text: "I have fever", source: "app" });
    await prisma.alert.updateMany({ data: { acknowledgedAt: new Date(), acknowledgedBy: "Anita" } });
    await companionTurn({ elder, text: "मुझे खांसी हो रही है", source: "app" });
    await companionTurn({ elder, text: "sir dard ho raha hai", source: "app" });
    const alerts = await prisma.alert.findMany({ where: { elderId: elder.id }, orderBy: { createdAt: "asc" } });
    expect(alerts).toHaveLength(2);
    expect(alerts[0].message).toContain("I have fever");
    expect(alerts[1].acknowledgedAt).toBeNull();
    expect(alerts[1].message).toBe("Ramesh told the companion: “मुझे खांसी हो रही है”, then “sir dard ho raha hai”. Maybe give them a call.");
  });

  it("answers in Hindi for Hindi-language elders", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id, { language: "hi", name: "Kamlaben Shah" });
    const r = await companionTurn({ elder, text: "मुझे बुखार है", source: "app" });
    expect(r.reply).toMatch(/[ऀ-ॿ]/);
    expect(r.reply).toContain("Kamlaben");
  });

  it("still raises a separate alert for pain alongside illness", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    await companionTurn({ elder, text: "I have a fever and my knee pain is bad", source: "app" });
    const kinds = (await prisma.alert.findMany({ where: { elderId: elder.id } })).map((a) => a.kind).sort();
    expect(kinds).toEqual(["HEALTH_CONCERN", "LOW_MOOD"]);
  });

  it("uses the fixed caring reply even when an AI model is configured", async () => {
    vi.stubEnv("GROQ_API_KEY", "gk");
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    const r = await companionTurn({ elder, text: "Mujhe bukhaar hai", source: "app" });
    expect(r.usedLlm).toBe(false);
    expect(r.reply).toMatch(/family/);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("dashboard preview never stores messages or raises alerts", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    const r = await companionTurn({ elder, text: "I have a fever", source: "dashboard", persist: false });
    expect(r.reply).toMatch(/not feeling well|Get well soon/);
    expect(await prisma.alert.count()).toBe(0);
    expect(await prisma.chatMessage.count()).toBe(0);
  });
});

describe("companion: variety and language of fallbacks", () => {
  beforeEach(resetDb);

  it("retries once when the model repeats itself", async () => {
    vi.stubEnv("GROQ_API_KEY", "gk");
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    await prisma.chatMessage.create({ data: { elderId: elder.id, role: "assistant", content: "Would you like to listen to some old film songs?" } });
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "Would you like to listen to some old film songs?" } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "Shall we plan a call with your grandson Aarav?" } }] })));
    const r = await companionTurn({ elder, text: "I am bored", source: "app" });
    expect(r.usedLlm).toBe(true);
    expect(r.reply).toBe("Shall we plan a call with your grandson Aarav?");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });

  it("answers Hindi speech with Hindi built-in phrases even for an English-language profile", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id, { language: "en" });
    const r = await companionTurn({ elder, text: "मुझे आज थोड़ा अकेलापन लग रहा है", source: "app" });
    expect(r.usedLlm).toBe(false);
    expect(r.reply).toMatch(/[ऀ-ॿ]/);
  });
});

describe("health alert wording", () => {
  beforeEach(resetDb);
  it("strips sentence punctuation inside quotes", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    await companionTurn({ elder, text: "मुझे खांसी हो रही है।", source: "app" });
    const a = await prisma.alert.findFirstOrThrow();
    expect(a.message).toBe("Ramesh told the companion: “मुझे खांसी हो रही है”. Maybe give them a call.");
  });
});
