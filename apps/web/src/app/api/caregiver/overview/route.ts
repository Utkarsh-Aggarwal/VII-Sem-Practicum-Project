import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { route } from "@/lib/http";
import { caregiverOverview } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const caregiver = await requireCaregiver(request);
  return NextResponse.json({
    caregiver: { id: caregiver.id, name: caregiver.name },
    elders: await caregiverOverview(caregiver),
  });
});
