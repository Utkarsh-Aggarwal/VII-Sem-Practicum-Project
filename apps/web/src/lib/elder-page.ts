import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentCaregiver } from "@/lib/auth";

// Shared by the parent page layout and its tabs. React's cache() makes the layout and the active
// tab share one lookup per request.
export const loadElderPage = cache(async (id: string) => {
  const caregiver = await currentCaregiver();
  if (!caregiver) redirect("/login");
  const elder = await prisma.elder.findFirst({
    where: { id, caregivers: { some: { caregiverId: caregiver.id } } },
    include: { caregivers: { include: { caregiver: { select: { id: true, name: true, email: true } } } } },
  });
  if (!elder) notFound();
  return { caregiver, elder };
});

// Server components hand Dates to client components; a JSON round-trip turns them into strings.
export type Jsonified<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonified<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonified<T[K]> }
      : T;
export const plain = <T,>(v: T): Jsonified<T> => JSON.parse(JSON.stringify(v));

export async function loadConversations(elderId: string, take = 15) {
  const conversations = await prisma.conversation.findMany({
    where: { elderId },
    orderBy: { startedAt: "desc" },
    take,
    include: { messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, viaVoice: true, createdAt: true } } },
  });
  return plain(conversations.map((c) => ({ ...c, concerns: c.concerns ? (JSON.parse(c.concerns) as string[]) : [] })));
}
