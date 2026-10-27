import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCaregiver, requireElderAccess } from "@/lib/auth";
import { readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/checkins?elderId=xxx&days=7  (all of the caregiver's elders when elderId is omitted)
export const GET = route(async (request) => {
  const elderId = request.nextUrl.searchParams.get("elderId");
  const days = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get("days") || "7")));

  let elderIds: string[];
  if (elderId) {
    await requireElderAccess(request, elderId);
    elderIds = [elderId];
  } else {
    const caregiver = await requireCaregiver(request);
    const links = await prisma.caregiverLink.findMany({ where: { caregiverId: caregiver.id } });
    elderIds = links.map((l) => l.elderId);
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const checkIns = await prisma.checkIn.findMany({
    where: { elderId: { in: elderIds }, scheduledFor: { gte: since } },
    include: { reminder: true, elder: true },
    orderBy: { scheduledFor: "desc" },
  });

  return NextResponse.json({ checkIns });
});

const createSchema = z.object({
  elderId: z.string(),
  reminderId: z.string(),
  scheduledFor: z.string().optional(),
});

// POST /api/checkins — create a check-in instance by hand (the scheduler normally does this).
export const POST = route(async (request) => {
  const { elderId, reminderId, scheduledFor } = await readJson(request, createSchema);
  await requireElderAccess(request, elderId);
  await prisma.reminder.findFirstOrThrow({ where: { id: reminderId, elderId } });

  const checkIn = await prisma.checkIn.create({
    data: {
      elderId,
      reminderId,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
      status: "PENDING",
    },
  });

  return NextResponse.json({ checkIn }, { status: 201 });
});
