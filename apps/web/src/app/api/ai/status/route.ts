import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { route } from "@/lib/http";
import { llmConfigured, resolveProvider } from "@/lib/ai/llm";
import { speechStatus } from "@/lib/ai/speech";
import { mqttConnected } from "@/lib/mqtt";

export const dynamic = "force-dynamic";

// Which optional integrations are live — shown on the dashboard so a demo never silently degrades.
export const GET = route(async (request) => {
  await requireCaregiver(request);
  return NextResponse.json({
    llm: llmConfigured() ? resolveProvider()!.name : null,
    ...speechStatus(),
    mqtt: process.env.MQTT_URL ? (mqttConnected() ? "connected" : "disconnected") : "disabled",
  });
});
