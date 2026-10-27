import { NextResponse } from "next/server";
import { requireActingElder } from "@/lib/auth";
import { route } from "@/lib/http";
import { ensureTodayCheckIns } from "@/lib/checkins";
import { dueAnnouncements } from "@/lib/announce";

export const dynamic = "force-dynamic";

// GET /api/mobile/due — polled by the senior app every ~15 s. Reminders that are due now, each with
// the sentence to speak and (when ElevenLabs is configured) ready-to-play audio. The app announces
// each `key` once: "reminder" at the scheduled time, "nudge" for the single follow-up.
export const GET = route(async (request) => {
  const { elder } = await requireActingElder(request, request.nextUrl.searchParams.get("elderId"));
  await ensureTodayCheckIns(elder);
  return NextResponse.json({ due: await dueAnnouncements(elder), serverTime: new Date().toISOString() });
});
