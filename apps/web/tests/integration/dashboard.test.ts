import { beforeEach, describe, expect, it } from "vitest";
import { call, makeCaregiver, makeElder, prisma, req, resetDb } from "../helpers";
import { caregiverAlerts, caregiverOverview, openAlertCount } from "@/lib/dashboard";
import * as me from "@/app/api/auth/me/route";
import * as login from "@/app/api/auth/login/route";

beforeEach(resetDb);

describe("alerts inbox queries", () => {
  it("lists alerts for all of a caregiver's parents, and only theirs", async () => {
    const { caregiver } = await makeCaregiver();
    const { caregiver: other } = await makeCaregiver("Other");
    const mom = await makeElder(caregiver.id, { name: "Kamla Shah" });
    const dad = await makeElder(caregiver.id, { name: "Ramesh Shah" });
    const stranger = await makeElder(other.id, { name: "Someone Else" });
    await prisma.alert.createMany({
      data: [
        { elderId: mom.id, kind: "LOW_MOOD", severity: "warning", title: "Seems low", message: "m" },
        { elderId: dad.id, kind: "HELP_REQUEST", severity: "critical", title: "Help", message: "m" },
        { elderId: dad.id, kind: "HUB_OFFLINE", severity: "info", title: "Hub offline", message: "m" },
        { elderId: dad.id, kind: "LOW_MOOD", severity: "warning", title: "Old", message: "m", acknowledgedAt: new Date(), acknowledgedBy: "Anita" },
        { elderId: stranger.id, kind: "HELP_REQUEST", severity: "critical", title: "Not yours", message: "m" },
      ],
    });
    const all = await caregiverAlerts(caregiver.id);
    expect(all.map((a) => a.title).sort()).toEqual(["Help", "Hub offline", "Old", "Seems low"]);
    expect(all[0].elder.name).toBeTruthy();
    expect((await caregiverAlerts(caregiver.id, { onlyOpen: true })).length).toBe(3);
    expect(await openAlertCount(caregiver.id)).toBe(2); // info alerts don't count towards the badge
  });

  it("overview carries the status line and last conversation summary", async () => {
    const { caregiver } = await makeCaregiver();
    const elder = await makeElder(caregiver.id);
    await prisma.conversation.create({ data: { elderId: elder.id, summary: "Talked about cricket.", mood: "good", endedAt: new Date() } });
    const [row] = await caregiverOverview(caregiver);
    expect(row.status.tone).toBe("good");
    expect(row.lastTalk?.summary).toBe("Talked about cricket.");
  });
});

describe("PATCH /api/auth/me (account settings)", () => {
  it("updates the name", async () => {
    const { token } = await makeCaregiver("Anita");
    const res = await call(me.PATCH, req("PATCH", "/api/auth/me", { cookie: token, body: { name: "Anita Shah" } }));
    expect(res.json.caregiver.name).toBe("Anita Shah");
  });

  it("changes the password only with the right current password", async () => {
    const { caregiver, token } = await makeCaregiver();
    const wrong = await call(me.PATCH, req("PATCH", "/x", { cookie: token, body: { currentPassword: "nope", newPassword: "newpassword1" } }));
    expect(wrong.status).toBe(400);
    const missing = await call(me.PATCH, req("PATCH", "/x", { cookie: token, body: { newPassword: "newpassword1" } }));
    expect(missing.status).toBe(400);
    const ok = await call(me.PATCH, req("PATCH", "/x", { cookie: token, body: { currentPassword: "password123", newPassword: "newpassword1" } }));
    expect(ok.status).toBe(200);
    const relogin = await call(login.POST, req("POST", "/api/auth/login", { body: { email: caregiver.email, password: "newpassword1" } }));
    expect(relogin.status).toBe(200);
  });

  it("requires sign-in", async () => {
    expect((await call(me.PATCH, req("PATCH", "/x", { body: { name: "x" } }))).status).toBe(401);
  });
});
