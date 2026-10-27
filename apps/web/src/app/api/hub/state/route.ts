import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDevice } from "@/lib/auth";
import { route } from "@/lib/http";
import { findOpenCheckIn } from "@/lib/checkins";
import { mqttConnected } from "@/lib/mqtt";

export const dynamic = "force-dynamic";

// GET /api/hub/state — polling fallback for hubs without MQTT (call every ~15-30 s).
// Also doubles as a heartbeat, so the dashboard shows the hub as online.
export const GET = route(async (request) => {
  const device = await requireDevice(request, "HUB");
  const elder = await prisma.elder.findUniqueOrThrow({ where: { id: device.elderId } });
  const open = await findOpenCheckIn(elder.id);
  return NextResponse.json({
    serverTime: new Date().toISOString(),
    elder: { name: elder.name, language: elder.language, timezone: elder.timezone },
    mqtt: mqttConnected(),
    pendingReminder:
      open && open.notifiedAt
        ? {
            checkInId: open.id,
            type: open.reminder.type,
            label: open.reminder.label,
            question: open.reminder.question,
            speak: open.reminder.question,
            scheduledFor: open.scheduledFor.toISOString(),
            answered: open.response === "not_yet" ? "not_yet" : null,
          }
        : null,
  });
});
