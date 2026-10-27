import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPrincipal } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";
import { emitCareEvent } from "@/lib/events";
import { raiseAlert } from "@/lib/alerts";
import { encouragementFor } from "@/lib/ai/companion";
import { zonedDayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

const schema = z.object({
  elderId: z.string().optional(), // ignored for paired devices — they can only report for their own elder
  mood: z.enum(["great", "okay", "not_great"]),
  note: z.string().max(500).optional(),
});

export const POST = route(async (request) => {
  const body = await readJson(request, schema);
  const principal = await getPrincipal(request);
  if (!principal) throw new HttpError(401, "Please sign in");

  let elderId: string;
  if (principal.kind === "device") {
    elderId = principal.device.elderId;
  } else {
    if (!body.elderId) throw new HttpError(400, "elderId is required");
    const link = await prisma.caregiverLink.findUnique({
      where: { elderId_caregiverId: { elderId: body.elderId, caregiverId: principal.caregiver.id } },
    });
    if (!link) throw new HttpError(404, "Not found");
    elderId = body.elderId;
  }

  const moodLog = await prisma.moodLog.create({ data: { elderId, mood: body.mood, note: body.note || null } });
  emitCareEvent({ elderId, type: "mood.created", payload: moodLog });

  const elder = await prisma.elder.findUniqueOrThrow({ where: { id: elderId } });
  if (body.mood === "not_great") {
    await raiseAlert({
      elderId,
      kind: "LOW_MOOD",
      severity: "info",
      title: "Not feeling great",
      message: `${elder.name.split(" ")[0]} said they're not feeling great today${body.note ? `: “${body.note}”` : "."}`,
      dedupeKey: `mood:${elderId}:${zonedDayKey(new Date(), elder.timezone)}`,
    });
  }

  const message = encouragementFor("FEELING", body.mood, elder);
  return NextResponse.json({ moodLog, message }, { status: 201 });
});
