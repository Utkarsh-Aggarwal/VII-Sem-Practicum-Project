import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActingElder } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { recordSelfReport, SELF_REPORT_KINDS } from "@/lib/selfreports";

export const dynamic = "force-dynamic";

const schema = z.object({
  elderId: z.string().optional(),
  kind: z.enum(SELF_REPORT_KINDS),
  answer: z.string().trim().min(1).max(40),
  text: z.string().max(500).optional(),
});

export const POST = route(async (request) => {
  const body = await readJson(request, schema);
  const { principal, elder } = await requireActingElder(request, body.elderId);
  const source = principal.kind === "device" && principal.device.kind === "HUB" ? "hub" : "app";
  const result = await recordSelfReport(elder, { kind: body.kind, answer: body.answer, text: body.text, source });
  return NextResponse.json(result, { status: 201 });
});
