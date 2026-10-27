import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

// DELETE /api/devices/[id] — caregiver unpairs a phone or hub; its token stops working immediately.
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  const device = await prisma.device.findUniqueOrThrow({ where: { id } });
  await requireCaregiverForElder(request, device.elderId);
  await prisma.device.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
