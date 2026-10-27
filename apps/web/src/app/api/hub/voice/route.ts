import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDevice } from "@/lib/auth";
import { HttpError, route } from "@/lib/http";
import { handleHubReply } from "@/lib/hub";
import { synthesize, transcribe } from "@/lib/ai/speech";
import { clipExtension, storeClip } from "@/lib/voice-audio";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

// POST /api/hub/voice — push-to-talk clip from the hub.
//   multipart/form-data with field "audio" (WAV, 16 kHz mono recommended), optional "checkInId"
//   or raw body with Content-Type audio/wav
// Runs STT, then the same logic as /api/hub/reply (reminder answer or companion chat).
export const POST = route(async (request) => {
  const device = await requireDevice(request, "HUB");
  const elder = await prisma.elder.findUniqueOrThrow({ where: { id: device.elderId } });

  const type = request.headers.get("content-type") || "";
  let audio: Blob | null = null;
  let checkInId: string | undefined;
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const f = form.get("audio");
    if (f instanceof Blob) audio = f;
    checkInId = (form.get("checkInId") as string | null) || undefined;
  } else if (type.startsWith("audio/") || type === "application/octet-stream") {
    audio = new Blob([await request.arrayBuffer()], { type: type || "audio/wav" });
  }
  if (!audio || audio.size === 0) throw new HttpError(400, "Send the recording as multipart field 'audio' or a raw audio/wav body");
  if (audio.size > MAX_BYTES) throw new HttpError(413, "Recording too long (max 4 MB)");

  // Only hint Hindi; forcing English makes Whisper translate Hindi speech instead of transcribing it.
  const transcript = await transcribe(audio, elder.language === "hi" ? "hi" : undefined);
  if (transcript === null) {
    throw new HttpError(503, "Speech-to-text is not configured or failed; set STT_BASE_URL/GROQ_API_KEY, or send text to /api/hub/reply");
  }
  if (!transcript) return NextResponse.json({ transcript: "", say: null });

  const say = await handleHubReply(device, { text: transcript, checkInId });
  // Ready-to-play reply for the hub speaker (null when no TTS provider is configured).
  const speech = await synthesize(say.text);
  const audioUrl = speech ? `/api/voice-audio/${storeClip(speech.audio, speech.contentType)}.${clipExtension(speech.contentType)}` : null;
  return NextResponse.json({ transcript, say, audioUrl });
});
