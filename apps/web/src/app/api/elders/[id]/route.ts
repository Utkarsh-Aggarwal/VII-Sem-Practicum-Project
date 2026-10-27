import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder, requireElderAccess } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { isValidTimeZone } from "@/lib/time";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  const principal = await requireElderAccess(request, id);
  const elder = await prisma.elder.findUniqueOrThrow({
    where: { id },
    include: {
      caregivers: { include: { caregiver: { select: { id: true, name: true, email: true } } } },
      reminders: { orderBy: { time: "asc" } },
      moodLogs: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  // Devices don't get to see the pairing code or other caregivers' emails.
  if (principal.kind === "device") {
    const { pairingCode: _code, caregivers, ...rest } = elder;
    void _code;
    return NextResponse.json({
      elder: { ...rest, caregivers: caregivers.map((c) => ({ relation: c.relation, caregiver: { name: c.caregiver.name } })) },
    });
  }
  return NextResponse.json({ elder });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  timezone: z.string().refine(isValidTimeZone, "unknown timezone").optional(),
  // ESP32-CAM base URL; the dashboard loads {cameraUrl}/stream directly from the browser.
  cameraUrl: z.string().trim().max(300).nullable().optional(),
  language: z.enum(["en", "hi"]).optional(),
  profile: z.string().max(2000).nullable().optional(),
});

export const PATCH = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const body = await readJson(request, patchSchema);

  const elder = await prisma.elder.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
      ...(body.avatarColor !== undefined ? { avatarColor: body.avatarColor } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.cameraUrl !== undefined ? { cameraUrl: body.cameraUrl || null } : {}),
      ...(body.language !== undefined ? { language: body.language } : {}),
      ...(body.profile !== undefined ? { profile: body.profile || null } : {}),
    },
  });

  return NextResponse.json({ elder });
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  await prisma.elder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
