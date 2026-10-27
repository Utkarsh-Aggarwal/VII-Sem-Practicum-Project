import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const days = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("days") || "7")));
  const reports = await prisma.selfReport.findMany({
    where: { elderId: id, createdAt: { gte: new Date(Date.now() - days * 24 * 3600_000) } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ reports });
});
