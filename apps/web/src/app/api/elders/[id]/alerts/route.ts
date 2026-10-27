import { NextResponse } from "next/server";
import { requireCaregiverForElder } from "@/lib/auth";
import { route } from "@/lib/http";
import { listAlerts } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const onlyOpen = request.nextUrl.searchParams.get("open") === "1";
  return NextResponse.json({ alerts: await listAlerts(id, { onlyOpen, take: 50 }) });
});
