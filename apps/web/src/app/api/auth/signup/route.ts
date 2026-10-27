import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const POST = route(async (request) => {
  const { name, email, password } = await readJson(request, schema);
  const existing = await prisma.caregiver.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "An account with this email already exists");

  const passwordHash = await hashPassword(password);
  const caregiver = await prisma.caregiver.create({ data: { name, email, passwordHash } });

  const token = createSessionToken(caregiver.id);
  const res = NextResponse.json(
    { caregiver: { id: caregiver.id, name: caregiver.name, email: caregiver.email }, token },
    { status: 201 }
  );
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
});
