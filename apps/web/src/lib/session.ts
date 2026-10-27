import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless caregiver sessions: base64url(JSON payload) + "." + HMAC-SHA256 signature.
// Used both as the dashboard's httpOnly cookie and as a Bearer token for the caregiver mode
// of the mobile app. Kept free of Prisma imports so proxy.ts can use it.

export const SESSION_COOKIE = "cc_session";
const SESSION_DAYS = 30;

type SessionPayload = { sub: string; exp: number };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s === "change-me") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return "carecircle-dev-secret-do-not-use-in-production";
  }
  return s;
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSessionToken(caregiverId: string): string {
  const payload: SessionPayload = {
    sub: caregiverId,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 3600,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.sub !== "string" || payload.exp * 1000 < Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_DAYS * 24 * 3600,
};
