import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCaregiverForElder } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  relation: z.string().trim().max(40).default("Family"),
});

// POST: share this elder with another caregiver who already has an account (siblings, etc).
export const POST = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  await requireCaregiverForElder(request, id);
  const { email, relation } = await readJson(request, inviteSchema);
  const other = await prisma.caregiver.findUnique({ where: { email } });
  if (!other) throw new HttpError(404, "No CareCircle account with that email yet — ask them to sign up first.");
  const link = await prisma.caregiverLink.upsert({
    where: { elderId_caregiverId: { elderId: id, caregiverId: other.id } },
    create: { elderId: id, caregiverId: other.id, relation },
    update: { relation },
    include: { caregiver: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json({ link }, { status: 201 });
});

// DELETE ?caregiverId= : remove a caregiver (or yourself). The last caregiver can't be removed.
export const DELETE = route<Ctx>(async (request, { params }) => {
  const { id } = await params;
  const me = await requireCaregiverForElder(request, id);
  const caregiverId = request.nextUrl.searchParams.get("caregiverId") || me.id;
  const count = await prisma.caregiverLink.count({ where: { elderId: id } });
  if (count <= 1) throw new HttpError(400, "Every profile needs at least one caregiver.");
  await prisma.caregiverLink.delete({ where: { elderId_caregiverId: { elderId: id, caregiverId } } });
  return NextResponse.json({ ok: true });
});
