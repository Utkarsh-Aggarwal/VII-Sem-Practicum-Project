import { NextResponse } from "next/server";
import { requireActingElder } from "@/lib/auth";
import { HttpError, route } from "@/lib/http";
import { companionTurn } from "@/lib/ai/companion";
import { synthesize, transcribe } from "@/lib/ai/speech";
import { asLang } from "@/lib/ai/phrases";
import { clipExtension, storeClip } from "@/lib/voice-audio";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

const DIDNT_HEAR = {
  en: "Sorry, I couldn't hear that. Please hold the button and speak again.",
  hi: "माफ़ कीजिए, मैं सुन नहीं पाई। बटन दबाकर फिर से बोलिए।",
};

// POST /api/mobile/voice — hold-to-talk from the senior app.
// multipart/form-data: audio=<recording> (m4a/wav/mp3)
// -> speech-to-text (ElevenLabs Scribe, or Groq Whisper) -> companion -> text-to-speech (ElevenLabs)
// Response: { transcript, reply, audioUrl|null, conversationId, alertRaised }
export const POST = route(async (request) => {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const elderIdHint = (form?.get("elderId") as string | null) ?? null;
  const { elder } = await requireActingElder(request, elderIdHint);
  if (!(audio instanceof Blob) || audio.size === 0) throw new HttpError(400, "Send the recording as multipart field 'audio'");
  if (audio.size > MAX_BYTES) throw new HttpError(413, "Recording too long");

  const filename = audio instanceof File && audio.name ? audio.name : "clip.m4a";
  // Only hint Hindi; never force English, or Whisper translates Hindi/Hinglish speech instead of transcribing it.
  const transcript = await transcribe(audio, elder.language === "hi" ? "hi" : undefined, filename);
  if (transcript === null) {
    throw new HttpError(503, "Voice isn't set up on the server yet (add ELEVENLABS_API_KEY or GROQ_API_KEY).");
  }

  const result = transcript
    ? await companionTurn({ elder, text: transcript, source: "app", viaVoice: true })
    : null;
  const reply = result?.reply ?? DIDNT_HEAR[asLang(elder.language)];

  const speech = await synthesize(reply);
  const audioUrl = speech ? `/api/voice-audio/${storeClip(speech.audio, speech.contentType)}.${clipExtension(speech.contentType)}` : null;

  return NextResponse.json({
    transcript,
    reply,
    audioUrl,
    conversationId: result?.conversationId ?? null,
    alertRaised: !!result?.alertRaised,
  });
});
