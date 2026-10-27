import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCaregiver } from "@/lib/auth";
import { readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ pushToken: z.string().max(200).nullable() });

// The caregiver mode of the mobile app registers its Expo push token for alerts.
export const POST = route(async (request) => {
  const caregiver = await requireCaregiver(request);
  const { pushToken } = await readJson(request, schema);
  await prisma.caregiver.update({ where: { id: caregiver.id }, data: { pushToken } });
  return NextResponse.json({ ok: true });
});
