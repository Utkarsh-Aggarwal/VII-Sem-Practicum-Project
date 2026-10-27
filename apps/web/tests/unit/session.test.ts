import { describe, expect, it, vi } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/session";

describe("session tokens", () => {
  it("round-trips a caregiver id", () => {
    expect(verifySessionToken(createSessionToken("cg_123"))).toBe("cg_123");
  });

  it("rejects tampered, malformed and missing tokens", () => {
    const token = createSessionToken("cg_123");
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "someone_else", exp: 9999999999 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`)).toBeNull();
    expect(verifySessionToken(`${body}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifySessionToken("not-a-token")).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });

  it("expires after 30 days", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createSessionToken("cg_1");
    vi.setSystemTime(new Date("2026-01-30T00:00:00Z"));
    expect(verifySessionToken(token)).toBe("cg_1");
    vi.setSystemTime(new Date("2026-02-01T00:00:01Z"));
    expect(verifySessionToken(token)).toBeNull();
  });

  it("is bound to AUTH_SECRET", () => {
    const token = createSessionToken("cg_1");
    vi.stubEnv("AUTH_SECRET", "a-different-secret");
    expect(verifySessionToken(token)).toBeNull();
    vi.unstubAllEnvs();
  });
});
