import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCaregiver } from "@/lib/auth";
import { uniquePairingCode } from "@/lib/pairing";
import { readJson, route } from "@/lib/http";
import { isValidTimeZone } from "@/lib/time";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const caregiver = await requireCaregiver(request);
  const elders = await prisma.elder.findMany({
    where: { caregivers: { some: { caregiverId: caregiver.id } } },
    orderBy: { createdAt: "asc" },
    include: {
      caregivers: { include: { caregiver: { select: { id: true, name: true, email: true } } } },
      _count: { select: { reminders: true } },
    },
  });
  return NextResponse.json({ elders });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  relation: z.string().trim().max(40).optional(),
  language: z.enum(["en", "hi"]).optional(),
  timezone: z.string().refine(isValidTimeZone, "unknown timezone").optional(),
  profile: z.string().max(2000).optional(),
});

export const POST = route(async (request) => {
  const caregiver = await requireCaregiver(request);
  const body = await readJson(request, createSchema);

  const elder = await prisma.elder.create({
    data: {
      name: body.name,
      phone: body.phone || null,
      avatarColor: body.avatarColor || "#5B8DEF",
      language: body.language ?? "en",
      timezone: body.timezone ?? "Asia/Kolkata",
      profile: body.profile || null,
      pairingCode: await uniquePairingCode(),
      caregivers: { create: { caregiverId: caregiver.id, relation: body.relation || "Child" } },
    },
  });

  return NextResponse.json({ elder }, { status: 201 });
});
