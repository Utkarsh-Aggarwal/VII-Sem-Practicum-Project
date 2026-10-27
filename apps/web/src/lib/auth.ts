import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { Caregiver, Device } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { HttpError } from "@/lib/http";
import { hashDeviceToken } from "@/lib/auth-crypto";

export { hashDeviceToken, hashPassword, newDeviceToken, newPairingCode, verifyPassword } from "@/lib/auth-crypto";

function bearer(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

// --- Resolving who is calling ---

export type Principal =
  | { kind: "caregiver"; caregiver: Caregiver }
  | { kind: "device"; device: Device };

export async function getPrincipal(request: NextRequest): Promise<Principal | null> {
  const token = bearer(request);
  if (token?.startsWith("ccd_")) {
    const device = await prisma.device.findUnique({ where: { tokenHash: hashDeviceToken(token) } });
    if (!device) return null;
    // Cheap heartbeat: any authenticated request counts as the device being seen.
    if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 30_000) {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date(), online: true },
      });
    }
    return { kind: "device", device };
  }
  const caregiverId = verifySessionToken(token ?? request.cookies.get(SESSION_COOKIE)?.value);
  if (!caregiverId) return null;
  const caregiver = await prisma.caregiver.findUnique({ where: { id: caregiverId } });
  return caregiver ? { kind: "caregiver", caregiver } : null;
}

export async function requireCaregiver(request: NextRequest): Promise<Caregiver> {
  const p = await getPrincipal(request);
  if (p?.kind !== "caregiver") throw new HttpError(401, "Please sign in");
  return p.caregiver;
}

export async function requireDevice(request: NextRequest, kind?: "APP" | "HUB"): Promise<Device> {
  const p = await getPrincipal(request);
  if (p?.kind !== "device") throw new HttpError(401, "Device not paired");
  if (kind && p.device.kind !== kind) throw new HttpError(403, `Only a paired ${kind.toLowerCase()} can do this`);
  return p.device;
}

export async function caregiverCanAccess(caregiverId: string, elderId: string) {
  const link = await prisma.caregiverLink.findUnique({
    where: { elderId_caregiverId: { elderId, caregiverId } },
  });
  return !!link;
}

// Either a caregiver linked to this elder, or a device paired to this elder.
export async function requireElderAccess(request: NextRequest, elderId: string): Promise<Principal> {
  const p = await getPrincipal(request);
  if (!p) throw new HttpError(401, "Please sign in");
  if (p.kind === "device") {
    if (p.device.elderId !== elderId) throw new HttpError(403, "Not your profile");
    return p;
  }
  if (!(await caregiverCanAccess(p.caregiver.id, elderId))) throw new HttpError(404, "Not found");
  return p;
}

export async function requireCaregiverForElder(request: NextRequest, elderId: string): Promise<Caregiver> {
  const caregiver = await requireCaregiver(request);
  if (!(await caregiverCanAccess(caregiver.id, elderId))) throw new HttpError(404, "Not found");
  return caregiver;
}

// For the senior-facing endpoints: a paired device acts for its own elder; a caregiver (e.g. testing
// from a laptop) must name an elder they're linked to.
export async function requireActingElder(request: NextRequest, elderIdHint?: string | null) {
  const p = await getPrincipal(request);
  if (!p) throw new HttpError(401, "Please pair this app first");
  const elderId = p.kind === "device" ? p.device.elderId : elderIdHint;
  if (!elderId) throw new HttpError(400, "elderId is required");
  if (p.kind === "caregiver" && !(await caregiverCanAccess(p.caregiver.id, elderId))) {
    throw new HttpError(404, "Not found");
  }
  const elder = await prisma.elder.findUniqueOrThrow({ where: { id: elderId } });
  return { principal: p, elder };
}

// For server components: the signed-in caregiver, or null.
export async function currentCaregiver(): Promise<Caregiver | null> {
  const store = await cookies();
  const id = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  return prisma.caregiver.findUnique({ where: { id } });
}
