import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashDeviceToken, hashPassword } from "@/lib/auth-crypto";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

export { prisma };

const BASE = "http://test.local";

type ReqOpts = { body?: unknown; token?: string; cookie?: string; headers?: Record<string, string>; raw?: BodyInit };

export function req(method: string, path: string, opts: ReqOpts = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.cookie = `${SESSION_COOKIE}=${opts.cookie}`;
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers,
    body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
}

type Handler = (r: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

// Calls a route handler the way Next.js does and returns status + parsed JSON.
export async function call(handler: unknown, request: NextRequest, params: Record<string, string> = {}) {
  const res = await (handler as Handler)(request, { params: Promise.resolve(params) });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read arbitrary response shapes
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

export async function resetDb() {
  await prisma.alert.deleteMany();
  await prisma.caregiverNote.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.sensorReading.deleteMany();
  await prisma.selfReport.deleteMany();
  await prisma.device.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.moodLog.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.caregiverLink.deleteMany();
  await prisma.elder.deleteMany();
  await prisma.caregiver.deleteMany();
}

let n = 0;

export async function makeCaregiver(name = "Anita") {
  n++;
  const caregiver = await prisma.caregiver.create({
    data: { name, email: `cg${n}-${Date.now()}@example.com`, passwordHash: await hashPassword("password123") },
  });
  return { caregiver, token: createSessionToken(caregiver.id) };
}

export async function makeElder(caregiverId: string, data: Partial<{ name: string; timezone: string; language: string; profile: string }> = {}) {
  n++;
  return prisma.elder.create({
    data: {
      name: data.name ?? "Ramesh Shah",
      timezone: data.timezone ?? "Asia/Kolkata",
      language: data.language ?? "en",
      profile: data.profile,
      pairingCode: String(100000 + n),
      caregivers: { create: { caregiverId, relation: "Daughter" } },
    },
  });
}

export async function makeDevice(elderId: string, kind: "APP" | "HUB" = "APP", extra: Partial<{ pushToken: string; online: boolean; lastSeenAt: Date }> = {}) {
  n++;
  const token = `ccd_test-${kind}-${n}-${Date.now()}`;
  const device = await prisma.device.create({
    data: { elderId, kind, name: kind === "HUB" ? "Hub" : "Phone", tokenHash: hashDeviceToken(token), ...extra },
  });
  return { device, token };
}

export async function makeReminder(elderId: string, data: Partial<{ time: string; type: string; label: string; question: string; daysOfWeek: string; active: boolean }> = {}) {
  return prisma.reminder.create({
    data: {
      elderId,
      type: data.type ?? "MEDICINE",
      label: data.label ?? "BP tablet",
      time: data.time ?? "08:00",
      question: data.question ?? "Did you take your BP tablet?",
      daysOfWeek: data.daysOfWeek ?? "1,2,3,4,5,6,7",
      active: data.active ?? true,
    },
  });
}

// Freeze "now" without faking timers (Prisma needs real timers).
export function freezeTime(iso: string, vi: { useFakeTimers: (o: object) => void; setSystemTime: (d: Date) => void }) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}
