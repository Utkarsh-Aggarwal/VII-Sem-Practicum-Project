import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

// Kept for backwards compatibility: returns only the signed-in caregiver (accounts are created via /api/auth/signup).
export const GET = route(async (request) => {
  const caregiver = await requireCaregiver(request);
  return NextResponse.json({ caregivers: [{ id: caregiver.id, name: caregiver.name, email: caregiver.email }] });
});
