import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActingElder } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { raiseAlert } from "@/lib/alerts";
import { asLang, pickPhrase } from "@/lib/ai/phrases";

export const dynamic = "force-dynamic";

const schema = z.object({ elderId: z.string().optional(), note: z.string().max(300).optional() });

// POST /api/mobile/help — the big "I need help" button. Always raises a critical alert.
export const POST = route(async (request) => {
  const body = await readJson(request, schema);
  const { elder } = await requireActingElder(request, body.elderId);
  const name = elder.name.split(" ")[0];
  await raiseAlert({
    elderId: elder.id,
    kind: "HELP_REQUEST",
    severity: "critical",
    title: "Pressed “I need help”",
    message: `${name} pressed the help button in the app${body.note ? `: “${body.note}”` : "."} Please call them now.`,
    // Repeated taps within 2 minutes are one alert.
    dedupeKey: `helpapp:${elder.id}:${Math.floor(Date.now() / 120_000)}`,
  });
  return NextResponse.json({ ok: true, message: pickPhrase("helpAck", asLang(elder.language), { name }) });
});
