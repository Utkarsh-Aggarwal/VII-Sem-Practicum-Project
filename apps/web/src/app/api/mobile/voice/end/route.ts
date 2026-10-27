import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActingElder } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { endCurrentConversation } from "@/lib/conversations";

export const dynamic = "force-dynamic";

// POST /api/mobile/voice/end — the senior left the talk screen: summarise the conversation now
// (otherwise the scheduler does it after 10 quiet minutes).
export const POST = route(async (request) => {
  const body = await readJson(request, z.object({ elderId: z.string().optional() }));
  const { elder } = await requireActingElder(request, body.elderId);
  const convo = await endCurrentConversation(elder.id);
  return NextResponse.json({ ended: !!convo, summary: convo?.summary ?? null });
});
