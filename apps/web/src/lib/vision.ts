import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { emitCareEvent } from "@/lib/events";
import { raiseAlert } from "@/lib/alerts";
import { HttpError } from "@/lib/http";

// Events from the camera AI service (services/vision): YOLO pose finds people and their posture,
// DeepFace tells the patient apart from other people. Frames never reach this server — only these
// small results do. The service authenticates with VISION_TOKEN.

export const POSTURES = ["standing", "sitting", "lying", "unknown"] as const;

const personSchema = z.object({
  posture: z.enum(POSTURES),
  identity: z.string().max(60).nullable().optional(), // "patient", a family member's label, "unknown" (face seen, no match), or null (no face)
  confidence: z.number().min(0).max(1).optional(),
});

export const visionEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("observation"), elderId: z.string(), people: z.array(personSchema).max(10) }),
  z.object({ type: z.literal("fall"), elderId: z.string(), identity: z.string().max(60).nullable().optional(), confidence: z.number().min(0).max(1).optional() }),
]);

export type VisionEvent = z.infer<typeof visionEventSchema>;
export type VisionPerson = z.infer<typeof personSchema>;
export type VisionState = { people: VisionPerson[]; at: string };

// Latest observation per elder, for the dashboard's live-feed badge. In-memory like voice-audio.ts:
// it is only a "what does the camera see now" hint, the alerts are what's stored.
const g = globalThis as unknown as { ccVision?: Map<string, VisionState> };
const latest = (g.ccVision ??= new Map());

export function latestVision(elderId: string): VisionState | null {
  return latest.get(elderId) ?? null;
}

// Where browsers and phones load a parent's live video. The ESP32-CAM serves its stream to one
// viewer at a time, so with VISION_STREAM_URL set the camera AI service is that viewer and relays the
// video to everyone; without it, they load the camera directly (and the camera AI can't watch).
export function relayStreamUrl(elderId: string) {
  const relay = process.env.VISION_STREAM_URL?.replace(/\/$/, "");
  return relay ? `${relay}/stream/${elderId}` : null;
}

export function liveStreamUrl(elder: { id: string; cameraUrl: string | null }) {
  if (!elder.cameraUrl) return null;
  return relayStreamUrl(elder.id) ?? `${elder.cameraUrl.replace(/\/$/, "")}/stream`;
}

export function requireVisionService(request: NextRequest) {
  const expected = process.env.VISION_TOKEN;
  if (!expected) throw new HttpError(503, "Camera AI is not configured (VISION_TOKEN)");
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Bad vision token");
}

function who(identity: string | null | undefined, firstName: string) {
  if (identity === "patient") return firstName;
  if (identity && identity !== "unknown") return identity;
  return null;
}

export async function handleVisionEvent(event: VisionEvent) {
  const elder = await prisma.elder.findUniqueOrThrow({ where: { id: event.elderId } });
  const name = elder.name.split(" ")[0];

  if (event.type === "fall") {
    const person = who(event.identity, name);
    return raiseAlert({
      elderId: elder.id,
      kind: "FALL_DETECTED",
      severity: "critical",
      title: "Possible fall seen by the camera",
      message: person
        ? `The camera saw ${person} go down and stay lying down. Check on ${name} right now.`
        : `The camera saw someone go down and stay lying down. Check on ${name} right now.`,
      data: { source: "vision", identity: event.identity ?? null, confidence: event.confidence ?? null },
      dedupeKey: `fall:${elder.id}:${Math.floor(Date.now() / 120_000)}`,
    });
  }

  const state: VisionState = { people: event.people, at: new Date().toISOString() };
  latest.set(elder.id, state);
  emitCareEvent({ elderId: elder.id, type: "vision.observation", payload: state });

  // Anyone in view counts as activity, so the "no activity" check sees the camera too.
  if (event.people.length) {
    await prisma.sensorReading.create({ data: { elderId: elder.id, kind: "motion", value: event.people.length } });
  }

  // A face the camera doesn't know, with no known face next to it: worth a quiet note, not a siren
  // (carers and visitors come and go). Faces are enrolled in services/vision/faces/.
  const known = event.people.some((p) => p.identity && p.identity !== "unknown");
  if (!known && event.people.some((p) => p.identity === "unknown")) {
    await raiseAlert({
      elderId: elder.id,
      kind: "UNKNOWN_PERSON",
      severity: "info",
      title: "Someone new at home",
      message: `The camera saw a face it doesn't know at ${name}'s home.`,
      data: { source: "vision" },
      dedupeKey: `unknown-face:${elder.id}:${Math.floor(Date.now() / 1_800_000)}`,
    });
  }
  return null;
}
