import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getClip } from "@/lib/voice-audio";

export const dynamic = "force-dynamic";

// GET /api/voice-audio/{id}.mp3 — a spoken companion reply. The id is random and expires in 10 minutes.
export const GET = route<{ params: Promise<{ id: string }> }>(async (_request, { params }) => {
  const { id } = await params;
  const clip = getClip(id.replace(/\.(mp3|wav|ogg)$/, ""));
  if (!clip) return NextResponse.json({ error: "Audio expired" }, { status: 404 });
  return new NextResponse(clip.audio, {
    headers: { "Content-Type": clip.contentType, "Cache-Control": "private, max-age=600", "Content-Length": String(clip.audio.byteLength) },
  });
});
