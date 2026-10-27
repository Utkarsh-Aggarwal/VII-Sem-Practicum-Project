import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { route } from "@/lib/http";
import { getRoutineInsights } from "@/lib/ai/routine-service";

export const dynamic = "force-dynamic";

// GET /api/elders/[id]/insights — per-day routine features, deviation scores, and today's explanation.
export const GET = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const elder = await prisma.elder.findUniqueOrThrow({ where: { id } });
  const days = Math.min(30, Math.max(3, Number(request.nextUrl.searchParams.get("days") || "14")));
  return NextResponse.json(await getRoutineInsights(elder, new Date(), days));
});
