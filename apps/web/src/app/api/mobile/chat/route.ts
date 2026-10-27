import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActingElder } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { companionTurn } from "@/lib/ai/companion";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const { elder } = await requireActingElder(request, request.nextUrl.searchParams.get("elderId"));
  const messages = await prisma.chatMessage.findMany({
    where: { elderId: elder.id, source: { in: ["app", "hub"] } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return NextResponse.json({ messages: messages.reverse() });
});

const schema = z.object({ elderId: z.string().optional(), text: z.string().trim().min(1).max(1000) });

export const POST = route(async (request) => {
  const body = await readJson(request, schema);
  const { elder } = await requireActingElder(request, body.elderId);
  const result = await companionTurn({ elder, text: body.text, source: "app" });
  return NextResponse.json({
    reply: result.reply,
    intent: result.intent,
    answeredCheckInId: result.answeredCheckInId ?? null,
    alertRaised: !!result.alertRaised,
  });
});
