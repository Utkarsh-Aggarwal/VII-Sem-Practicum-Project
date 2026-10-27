import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireElderAccess } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { answerCheckIn } from "@/lib/checkins";
import { emitCareEvent } from "@/lib/events";
import { CHECKIN_STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  // Preferred: just say yes / not yet; the server decides on-time vs late.
  answer: z.enum(["yes", "no"]).optional(),
  // Legacy shape from the first version of the mobile app.
  status: z.enum(CHECKIN_STATUSES).optional(),
  response: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
});

// PATCH /api/checkins/[id]  — elder answers the notification from the mobile app
export const PATCH = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  const body = await readJson(request, schema);
  const existing = await prisma.checkIn.findUniqueOrThrow({ where: { id }, include: { reminder: true, elder: true } });
  const principal = await requireElderAccess(request, existing.elderId);
  const channel = principal.kind === "device" ? (principal.device.kind === "HUB" ? "hub" : "app") : "dashboard";

  const answer =
    body.answer ??
    (body.status?.startsWith("DONE") ? "yes" : body.status === undefined && body.response === "yes" ? "yes" : undefined);

  if (answer) {
    const { checkIn, message } = await answerCheckIn({ checkIn: existing, elder: existing.elder, answer, channel });
    return NextResponse.json({ checkIn, message });
  }

  // Explicit non-"yes" status (e.g. SKIPPED, or a caregiver correcting a record).
  const checkIn = await prisma.checkIn.update({
    where: { id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.response !== undefined ? { response: body.response } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
      respondedAt: new Date(),
      channel,
    },
    include: { reminder: true },
  });
  emitCareEvent({ elderId: checkIn.elderId, type: "checkin.updated", payload: checkIn });
  return NextResponse.json({ checkIn });
});
