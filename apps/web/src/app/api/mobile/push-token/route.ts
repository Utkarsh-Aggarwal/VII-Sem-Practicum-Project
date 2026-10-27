import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDevice } from "@/lib/auth";
import { readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ pushToken: z.string().max(200).nullable() });

// The senior app registers its Expo push token so the scheduler can push reminders to it.
export const POST = route(async (request) => {
  const device = await requireDevice(request, "APP");
  const { pushToken } = await readJson(request, schema);
  await prisma.device.update({ where: { id: device.id }, data: { pushToken } });
  return NextResponse.json({ ok: true });
});
