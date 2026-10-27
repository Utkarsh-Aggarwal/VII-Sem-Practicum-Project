import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { route } from "@/lib/http";
import { getEnvironment } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const elder = await prisma.elder.findUniqueOrThrow({ where: { id } });
  return NextResponse.json(await getEnvironment(elder));
});
