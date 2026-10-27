import type { Device, Elder } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { emitCareEvent } from "@/lib/events";
import { raiseAlert } from "@/lib/alerts";
import { answerCheckIn, findOpenCheckIn } from "@/lib/checkins";
import { companionTurn } from "@/lib/ai/companion";
import { asLang, partOfDay, pickPhrase } from "@/lib/ai/phrases";
import { zonedParts } from "@/lib/time";
import { publishToHub } from "@/lib/mqtt";

// Everything the smart-home hub can send, shared by the HTTP endpoints (/api/hub/*) and the
// MQTT bridge (carecircle/v1/hub/{deviceId}/{telemetry|event|reply|status}).
// See docs/API_CONTRACT.md for the wire format the firmware should implement.

export const SENSOR_KINDS = ["temperature", "humidity", "air_quality", "motion", "sound_level", "light"] as const;

export const telemetrySchema = z
  .object({
    temperature: z.number().min(-40).max(85).optional(),
    humidity: z.number().min(0).max(100).optional(),
    air_quality: z.number().min(0).optional(),
    motion: z.union([z.number().min(0), z.boolean()]).optional(), // PIR trigger count since last report, or true/false
    sound_level: z.number().min(0).optional(), // dB or raw 0..4095 — whatever the firmware reports, consistently
    light: z.number().min(0).optional(),
  })
  .loose();

export const eventSchema = z.object({
  type: z.enum(["help_button", "talk_button", "presence", "boot"]),
  detail: z.string().max(200).optional(),
});

export const replySchema = z
  .object({
    checkInId: z.string().optional(),
    answer: z.enum(["yes", "no"]).optional(), // physical button / hub-side keyword spotting
    text: z.string().max(1000).optional(), // transcript, if the hub did its own STT
  })
  .refine((r) => r.answer || r.text, "answer or text is required");

async function elderOf(device: Device): Promise<Elder> {
  return prisma.elder.findUniqueOrThrow({ where: { id: device.elderId } });
}

async function touch(device: Device) {
  if (!device.online || !device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 30_000) {
    await prisma.device.update({ where: { id: device.id }, data: { online: true, lastSeenAt: new Date() } });
    if (!device.online) emitCareEvent({ elderId: device.elderId, type: "device.status", payload: { deviceId: device.id, online: true } });
  }
}

export async function ingestTelemetry(device: Device, raw: unknown) {
  const data = telemetrySchema.parse(raw);
  await touch(device);
  const rows = SENSOR_KINDS.flatMap((kind) => {
    const v = data[kind];
    if (v === undefined) return [];
    return [{ elderId: device.elderId, deviceId: device.id, kind, value: typeof v === "boolean" ? Number(v) : v }];
  });
  if (rows.length) await prisma.sensorReading.createMany({ data: rows });
  emitCareEvent({ elderId: device.elderId, type: "telemetry", payload: Object.fromEntries(rows.map((r) => [r.kind, r.value])) });
  return { stored: rows.length };
}

export type HubSay = { text: string; kind: "reply" | "ack" | "greeting" | "reminder"; checkInId?: string };

async function say(device: Device, message: HubSay) {
  publishToHub(device.id, "say", message);
  return message;
}

export async function handleHubEvent(device: Device, raw: unknown): Promise<HubSay | null> {
  const event = eventSchema.parse(raw);
  await touch(device);
  const elder = await elderOf(device);
  const lang = asLang(elder.language);
  const name = elder.name.split(" ")[0];

  switch (event.type) {
    case "help_button": {
      await raiseAlert({
        elderId: elder.id,
        kind: "HELP_REQUEST",
        severity: "critical",
        title: "Pressed the help button",
        message: `${name} pressed the help button on the home hub.`,
        data: { deviceId: device.id },
        dedupeKey: `helpbtn:${device.id}:${Math.floor(Date.now() / 120_000)}`,
      });
      return say(device, { text: pickPhrase("helpAck", lang, { name }), kind: "ack" });
    }
    case "talk_button": {
      // If a reminder is open, the button means "ask me again"; otherwise start a chat.
      const open = await findOpenCheckIn(elder.id);
      if (open) return say(device, { text: open.reminder.question, kind: "reminder", checkInId: open.id });
      const hour = zonedParts(new Date(), elder.timezone).hour;
      return say(device, { text: pickPhrase("greeting", lang, { name, part: partOfDay(hour, lang) }), kind: "greeting" });
    }
    case "presence":
      await prisma.sensorReading.create({ data: { elderId: elder.id, deviceId: device.id, kind: "motion", value: 1 } });
      emitCareEvent({ elderId: elder.id, type: "telemetry", payload: { motion: 1 } });
      return null;
    case "boot":
      return null;
  }
}

export async function handleHubReply(device: Device, raw: unknown): Promise<HubSay> {
  const reply = replySchema.parse(raw);
  await touch(device);
  const elder = await elderOf(device);

  if (reply.answer) {
    const checkIn = reply.checkInId
      ? await prisma.checkIn.findFirst({ where: { id: reply.checkInId, elderId: elder.id }, include: { reminder: true } })
      : await findOpenCheckIn(elder.id);
    if (checkIn) {
      const { message } = await answerCheckIn({ checkIn, elder, answer: reply.answer, channel: "hub" });
      return say(device, { text: message, kind: "ack", checkInId: checkIn.id });
    }
    return say(device, { text: pickPhrase("chat", asLang(elder.language), { name: elder.name.split(" ")[0] }), kind: "reply" });
  }

  const result = await companionTurn({ elder, text: reply.text!, source: "hub" });
  return say(device, { text: result.reply, kind: result.answeredCheckInId ? "ack" : "reply", checkInId: result.answeredCheckInId });
}

export async function setHubStatus(device: Device, online: boolean) {
  await prisma.device.update({ where: { id: device.id }, data: { online, ...(online ? { lastSeenAt: new Date() } : {}) } });
  emitCareEvent({ elderId: device.elderId, type: "device.status", payload: { deviceId: device.id, online } });
}
