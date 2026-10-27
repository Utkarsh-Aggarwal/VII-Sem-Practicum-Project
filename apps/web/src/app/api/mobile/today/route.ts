import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActingElder } from "@/lib/auth";
import { route } from "@/lib/http";
import { ensureTodayCheckIns } from "@/lib/checkins";
import { pendingPrompts } from "@/lib/selfreports";
import { startOfZonedDay } from "@/lib/time";

export const dynamic = "force-dynamic";

// GET /api/mobile/today  (Bearer device token; caregivers may pass ?elderId= for testing)
// Today's active reminders, each paired with today's CheckIn (one id to PATCH), plus the
// wellbeing prompts still to ask and whether today's mood has been logged.
export const GET = route(async (request) => {
  const { elder } = await requireActingElder(request, request.nextUrl.searchParams.get("elderId"));
  const now = new Date();
  const [items, prompts, moodToday] = await Promise.all([
    ensureTodayCheckIns(elder, now),
    pendingPrompts(elder, now),
    prisma.moodLog.findFirst({
      where: { elderId: elder.id, createdAt: { gte: startOfZonedDay(now, elder.timezone) } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const { pairingCode: _code, ...publicElder } = elder;
  void _code;
  return NextResponse.json({ elder: publicElder, items, prompts, moodToday: moodToday?.mood ?? null });
});
