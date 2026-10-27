import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActingElder } from "@/lib/auth";
import { readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ elderId: z.string().optional(), language: z.enum(["en", "hi"]) });

// POST /api/mobile/preferences — the senior chose their language in the app (onboarding or settings).
// The companion, spoken reminders and hub all follow it; caregivers see it on the dashboard.
export const POST = route(async (request) => {
  const body = await readJson(request, schema);
  const { elder } = await requireActingElder(request, body.elderId);
  const updated = await prisma.elder.update({ where: { id: elder.id }, data: { language: body.language } });
  return NextResponse.json({ language: updated.language });
});
