import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashDeviceToken, newDeviceToken } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";
import { TOPIC_PREFIX } from "@/lib/mqtt";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "code must be 6 digits"),
  kind: z.enum(["APP", "HUB"]).default("APP"),
  name: z.string().trim().max(60).optional(),
});

// Naive in-memory brute-force guard: 10 attempts / 10 min per IP.
const attempts = new Map<string, { n: number; since: number }>();

// POST /api/devices/pair — the senior app or the hub exchanges the 6-digit code shown on the
// caregiver dashboard for a long-lived device token. The token is returned exactly once.
export const POST = route(async (request) => {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const a = attempts.get(ip);
  const now = Date.now();
  if (a && now - a.since < 600_000 && a.n >= 10) throw new HttpError(429, "Too many attempts, try again in a few minutes");

  const { code, kind, name } = await readJson(request, schema);
  const elder = await prisma.elder.findUnique({ where: { pairingCode: code } });
  if (!elder) {
    attempts.set(ip, a && now - a.since < 600_000 ? { n: a.n + 1, since: a.since } : { n: 1, since: now });
    throw new HttpError(404, "That code didn't match. Check the code on the family dashboard.");
  }
  attempts.delete(ip);

  const token = newDeviceToken();
  const device = await prisma.device.create({
    data: {
      elderId: elder.id,
      kind,
      name: name || (kind === "HUB" ? "Home hub" : "Phone app"),
      tokenHash: hashDeviceToken(token),
      online: true,
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json(
    {
      token,
      deviceId: device.id,
      elder: { id: elder.id, name: elder.name, avatarColor: elder.avatarColor, language: elder.language, timezone: elder.timezone },
      ...(kind === "HUB"
        ? {
            mqtt: process.env.MQTT_URL
              ? { url: process.env.MQTT_URL, topicPrefix: `${TOPIC_PREFIX}/${device.id}` }
              : null,
          }
        : {}),
    },
    { status: 201 }
  );
});
