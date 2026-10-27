import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { companionTurn } from "@/lib/ai/companion";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET: the companion conversation, for caregivers to read.
export const GET = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const messages = await prisma.chatMessage.findMany({
    where: { elderId: id },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return NextResponse.json({ messages: messages.reverse() });
});

const schema = z.object({ text: z.string().trim().min(1).max(1000) });

// POST: preview what the companion would say to this elder. Nothing is stored and no alerts fire.
export const POST = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const { text } = await readJson(request, schema);
  const elder = await prisma.elder.findUniqueOrThrow({ where: { id } });
  const result = await companionTurn({ elder, text, source: "dashboard", persist: false });
  return NextResponse.json(result);
});
