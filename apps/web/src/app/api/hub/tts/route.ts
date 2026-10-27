import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDevice } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";
import { synthesize } from "@/lib/ai/speech";

export const dynamic = "force-dynamic";

// POST /api/hub/tts — { text } -> audio bytes (WAV) for the hub's I2S speaker.
// 503 when no TTS provider is configured: the hub should then use its own fallback (chime + display).
export const POST = route(async (request) => {
  await requireDevice(request);
  const { text } = await readJson(request, z.object({ text: z.string().trim().min(1).max(600) }));
  const out = await synthesize(text);
  if (!out) throw new HttpError(503, "Text-to-speech is not configured");
  return new NextResponse(out.audio, { headers: { "Content-Type": out.contentType, "Cache-Control": "no-store" } });
});
