import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { HttpError, readJson, route } from "@/lib/http";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string(),
});

// Returns the token in the body too, for the caregiver mode of the mobile app (Bearer auth).
export const POST = route(async (request) => {
  const { email, password } = await readJson(request, schema);
  const caregiver = await prisma.caregiver.findUnique({ where: { email } });
  if (!caregiver || !(await verifyPassword(password, caregiver.passwordHash))) {
    throw new HttpError(401, "Wrong email or password");
  }
  const token = createSessionToken(caregiver.id);
  const res = NextResponse.json({
    caregiver: { id: caregiver.id, name: caregiver.name, email: caregiver.email },
    token,
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
});
