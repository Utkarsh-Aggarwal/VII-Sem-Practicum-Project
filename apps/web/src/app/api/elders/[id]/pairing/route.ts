import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { route } from "@/lib/http";
import { uniquePairingCode } from "@/lib/pairing";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET: current code + paired devices. POST: issue a fresh code (already-paired devices keep working).
export const GET = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  let elder = await prisma.elder.findUniqueOrThrow({ where: { id } });
  if (!elder.pairingCode) {
    elder = await prisma.elder.update({ where: { id }, data: { pairingCode: await uniquePairingCode() } });
  }
  const devices = await prisma.device.findMany({
    where: { elderId: id },
    select: { id: true, kind: true, name: true, online: true, lastSeenAt: true, createdAt: true, pushToken: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    pairingCode: elder.pairingCode,
    devices: devices.map(({ pushToken, ...d }) => ({ ...d, pushEnabled: !!pushToken })),
  });
});

export const POST = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const elder = await prisma.elder.update({ where: { id }, data: { pairingCode: await uniquePairingCode() } });
  return NextResponse.json({ pairingCode: elder.pairingCode });
});
