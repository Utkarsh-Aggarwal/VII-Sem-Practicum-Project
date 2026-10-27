import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCaregiver, requireCaregiverForElder } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { REMINDER_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAYS_RE = /^[1-7](,[1-7])*$/;

export const GET = route(async (request) => {
  const elderId = request.nextUrl.searchParams.get("elderId");
  if (elderId) await requireCaregiverForElder(request, elderId);
  const caregiver = await requireCaregiver(request);
  const reminders = await prisma.reminder.findMany({
    where: elderId ? { elderId } : { elder: { caregivers: { some: { caregiverId: caregiver.id } } } },
    orderBy: { time: "asc" },
  });
  return NextResponse.json({ reminders });
});

const createSchema = z.object({
  elderId: z.string(),
  type: z.enum(REMINDER_TYPES).default("CUSTOM"),
  label: z.string().trim().min(1).max(80),
  time: z.string().regex(TIME_RE, "time must be HH:mm"),
  question: z.string().trim().min(1).max(200),
  daysOfWeek: z.string().regex(DAYS_RE, "daysOfWeek must look like 1,2,3").default("1,2,3,4,5,6,7"),
});

export const POST = route(async (request) => {
  const body = await readJson(request, createSchema);
  await requireCaregiverForElder(request, body.elderId);
  const reminder = await prisma.reminder.create({ data: body });
  return NextResponse.json({ reminder }, { status: 201 });
});
