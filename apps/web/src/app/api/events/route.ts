import { prisma } from "@/lib/prisma";
import { requireCaregiver } from "@/lib/auth";
import { route } from "@/lib/http";
import { careEvents, type CareEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

// GET /api/events[?elderId=] — Server-Sent Events stream of live updates for the caregiver's elders.
export const GET = route(async (request) => {
  const caregiver = await requireCaregiver(request);
  const links = await prisma.caregiverLink.findMany({ where: { caregiverId: caregiver.id } });
  const wanted = request.nextUrl.searchParams.get("elderId");
  const allowed = new Set(links.map((l) => l.elderId).filter((id) => !wanted || id === wanted));

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const onEvent = (e: CareEvent) => {
        if (allowed.has(e.elderId)) send(`event: care\ndata: ${JSON.stringify(e)}\n\n`);
      };
      careEvents.on("event", onEvent);
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        careEvents.off("event", onEvent);
        clearInterval(heartbeat);
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      send("retry: 5000\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
