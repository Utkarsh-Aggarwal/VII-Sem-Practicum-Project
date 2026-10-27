import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { route } from "@/lib/http";
import { emitCareEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

// PATCH /api/alerts/[id] — acknowledge ("I'm on it"), so siblings can see someone has handled it.
export const PATCH = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  const existing = await prisma.alert.findUniqueOrThrow({ where: { id } });
  const caregiver = await requireCaregiverForElder(request, existing.elderId);
  const alert = await prisma.alert.update({
    where: { id },
    data: { acknowledgedAt: existing.acknowledgedAt ?? new Date(), acknowledgedBy: existing.acknowledgedBy ?? caregiver.name },
  });
  emitCareEvent({ elderId: alert.elderId, type: "alert.updated", payload: alert });
  return NextResponse.json({ alert });
});
