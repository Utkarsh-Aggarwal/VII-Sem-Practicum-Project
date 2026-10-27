import { describe, expect, it } from "vitest";
import { hashDeviceToken, hashPassword, newDeviceToken, newPairingCode, verifyPassword } from "@/lib/auth-crypto";

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("carecircle123");
    const b = await hashPassword("carecircle123");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(await verifyPassword("carecircle123", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
  });

  it("refuses legacy accounts without a password and garbage hashes", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "plain-text")).toBe(false);
  });
});

describe("device tokens and pairing codes", () => {
  it("creates unguessable prefixed tokens and stable hashes", () => {
    const t = newDeviceToken();
    expect(t).toMatch(/^ccd_[A-Za-z0-9_-]{32}$/);
    expect(newDeviceToken()).not.toBe(t);
    expect(hashDeviceToken(t)).toBe(hashDeviceToken(t));
    expect(hashDeviceToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("pairing codes are always 6 digits", () => {
    for (let i = 0; i < 200; i++) expect(newPairingCode()).toMatch(/^\d{6}$/);
  });
});
