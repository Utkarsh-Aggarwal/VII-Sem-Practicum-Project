import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth";
import { route } from "@/lib/http";
import { ingestTelemetry } from "@/lib/hub";

export const dynamic = "force-dynamic";

// POST /api/hub/telemetry — HTTP alternative to MQTT carecircle/v1/hub/{id}/telemetry
// Body: { temperature?, humidity?, air_quality?, motion?, sound_level?, light? }
export const POST = route(async (request) => {
  const device = await requireDevice(request, "HUB");
  return NextResponse.json(await ingestTelemetry(device, await request.json()));
});
