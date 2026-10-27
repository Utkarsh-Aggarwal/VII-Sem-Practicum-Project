import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { emitCareEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Shared notes thread between all caregivers of one elder ("Called Papa, he's fine, BP was 130/85").
export const GET = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const notes = await prisma.caregiverNote.findMany({
    where: { elderId: id },
    include: { caregiver: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ notes });
});

export const POST = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  const caregiver = await requireCaregiverForElder(request, id);
  const { body } = await readJson(request, z.object({ body: z.string().trim().min(1).max(2000) }));
  const note = await prisma.caregiverNote.create({
    data: { elderId: id, caregiverId: caregiver.id, body },
    include: { caregiver: { select: { name: true } } },
  });
  emitCareEvent({ elderId: id, type: "note.created", payload: note });
  return NextResponse.json({ note }, { status: 201 });
});
