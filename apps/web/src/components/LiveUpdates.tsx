"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Subscribes to /api/events (Server-Sent Events) and re-renders the server components when
// something changes for these elders — a reminder answered, an alert raised, new telemetry.
// Also shows a browser notification for new critical alerts while the tab is open.
export function LiveUpdates({ elderId, showIndicator = false }: { elderId?: string; showIndicator?: boolean }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/events${elderId ? `?elderId=${elderId}` : ""}`);
    let timer: ReturnType<typeof setTimeout> | undefined;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("care", (msg) => {
      try {
        const event = JSON.parse((msg as MessageEvent).data);
        if (event.type === "alert.created" && event.payload?.severity === "critical" && "Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification(event.payload.title, { body: event.payload.message });
          }
        }
      } catch {}
      // Telemetry can arrive every few seconds; batch refreshes.
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 800);
    });

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [elderId, router]);

  if (!showIndicator) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        connected ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-500"
      }`}
      title={connected ? "Updates appear automatically" : "Reconnecting to live updates…"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-stone-400"}`} />
      {connected ? "Live" : "Offline"}
    </span>
  );
}
