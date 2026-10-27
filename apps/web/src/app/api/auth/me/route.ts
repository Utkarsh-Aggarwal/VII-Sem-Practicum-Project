import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireCaregiver, verifyPassword } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const caregiver = await requireCaregiver(request);
  return NextResponse.json({ caregiver: { id: caregiver.id, name: caregiver.name, email: caregiver.email } });
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, "New password must be at least 8 characters").max(200).optional(),
  })
  .refine((b) => !b.newPassword || b.currentPassword, "Enter your current password");

// PATCH /api/auth/me — update your name and/or password (password change needs the current one).
export const PATCH = route(async (request) => {
  const caregiver = await requireCaregiver(request);
  const body = await readJson(request, patchSchema);
  if (body.newPassword && !(await verifyPassword(body.currentPassword!, caregiver.passwordHash))) {
    throw new HttpError(400, "Your current password isn't right");
  }
  const updated = await prisma.caregiver.update({
    where: { id: caregiver.id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.newPassword ? { passwordHash: await hashPassword(body.newPassword) } : {}),
    },
  });
  return NextResponse.json({ caregiver: { id: updated.id, name: updated.name, email: updated.email } });
});
