import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth";
import { route } from "@/lib/http";
import { handleHubReply } from "@/lib/hub";

export const dynamic = "force-dynamic";

// POST /api/hub/reply — { checkInId?, answer?: "yes"|"no", text? }
// A button answer to a reminder, or a transcript when the hub does its own STT.
export const POST = route(async (request) => {
  const device = await requireDevice(request, "HUB");
  const say = await handleHubReply(device, await request.json());
  return NextResponse.json({ say });
});
