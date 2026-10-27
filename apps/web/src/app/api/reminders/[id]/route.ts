import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { discardStaleCheckIns } from "@/lib/checkins";
import { REMINDER_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "time must be HH:mm").optional(),
  question: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
  daysOfWeek: z.string().regex(/^[1-7](,[1-7])*$/, "daysOfWeek must look like 1,2,3").optional(),
  type: z.enum(REMINDER_TYPES).optional(),
});

export const PATCH = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  const existing = await prisma.reminder.findUniqueOrThrow({ where: { id }, include: { elder: true } });
  await requireCaregiverForElder(request, existing.elderId);
  const body = await readJson(request, patchSchema);

  const reminder = await prisma.reminder.update({ where: { id }, data: body });

  const rescheduled =
    (body.time !== undefined && body.time !== existing.time) ||
    (body.daysOfWeek !== undefined && body.daysOfWeek !== existing.daysOfWeek) ||
    body.active === false;
  if (rescheduled) await discardStaleCheckIns(existing, existing.elder.timezone);

  return NextResponse.json({ reminder });
});

export const DELETE = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  const existing = await prisma.reminder.findUniqueOrThrow({ where: { id } });
  await requireCaregiverForElder(request, existing.elderId);
  await prisma.reminder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
