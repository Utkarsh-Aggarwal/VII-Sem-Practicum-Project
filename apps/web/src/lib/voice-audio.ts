import { randomBytes } from "node:crypto";

// Short-lived store for synthesized replies. The app gets an unguessable URL and plays it with the
// native audio player (which can't easily send auth headers or play data: URIs on iOS).
// In-memory: fine for a single backend process; replies expire after TTL_MS.

const TTL_MS = 10 * 60_000;
const MAX_ITEMS = 200;

type Clip = { audio: ArrayBuffer; contentType: string; expires: number };

const g = globalThis as unknown as { ccVoiceClips?: Map<string, Clip> };
const clips = (g.ccVoiceClips ??= new Map());

export function storeClip(audio: ArrayBuffer, contentType: string): string {
  const now = Date.now();
  for (const [id, c] of clips) if (c.expires < now) clips.delete(id);
  while (clips.size >= MAX_ITEMS) clips.delete(clips.keys().next().value!);
  const id = randomBytes(18).toString("base64url");
  clips.set(id, { audio, contentType, expires: now + TTL_MS });
  return id;
}

export function getClip(id: string): Clip | null {
  const c = clips.get(id);
  if (!c || c.expires < Date.now()) return null;
  return c;
}

export function clipExtension(contentType: string) {
  return contentType.includes("wav") ? "wav" : contentType.includes("ogg") || contentType.includes("opus") ? "ogg" : "mp3";
}
