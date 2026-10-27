import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/elders/[id]/conversations — companion conversations with their caregiver summaries.
export const GET = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const conversations = await prisma.conversation.findMany({
    where: { elderId: id },
    orderBy: { startedAt: "desc" },
    take: 30,
    include: { messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, viaVoice: true, createdAt: true } } },
  });
  return NextResponse.json({
    conversations: conversations.map((c) => ({ ...c, concerns: c.concerns ? (JSON.parse(c.concerns) as string[]) : [] })),
  });
});
