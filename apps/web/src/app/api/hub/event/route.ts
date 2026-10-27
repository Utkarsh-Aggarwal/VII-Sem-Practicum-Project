import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth";
import { route } from "@/lib/http";
import { handleHubEvent } from "@/lib/hub";

export const dynamic = "force-dynamic";

// POST /api/hub/event — { type: "help_button" | "talk_button" | "presence" | "boot" }
// Responds with { say } when the hub should speak something (also published on MQTT .../say).
export const POST = route(async (request) => {
  const device = await requireDevice(request, "HUB");
  const say = await handleHubEvent(device, await request.json());
  return NextResponse.json({ say });
});
