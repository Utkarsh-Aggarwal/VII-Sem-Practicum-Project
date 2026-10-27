"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, ICONS, timeAgo } from "@/components/Card";
import { useToast } from "@/components/ui/toast";

export type AlertItem = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  message: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

const SEVERITY: Record<string, { box: string; icon: string; label: string }> = {
  critical: { box: "border-rose-200 bg-[var(--danger-soft)]", icon: "text-[var(--danger)]", label: "Urgent" },
  warning: { box: "border-amber-200 bg-[var(--warning-soft)]", icon: "text-[var(--warning)]", label: "Check" },
  info: { box: "border-stone-200 bg-stone-50", icon: "text-stone-500", label: "FYI" },
};

export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const open = alerts.filter((a) => !a.acknowledgedAt);
  const shown = showAll ? alerts : open;

  async function ack(id: string) {
    setBusy(id);
    await fetch(`/api/alerts/${id}`, { method: "PATCH" });
    setBusy(null);
    toast("Marked as handled — the family can see you're on it");
    router.refresh();
  }

  return (
    <Card
      title={open.length ? `Alerts (${open.length} open)` : "Alerts"}
      icon={ICONS.alert}
      action={
        alerts.length > open.length && (
          <button onClick={() => setShowAll((s) => !s)} className="text-xs font-medium text-stone-400 hover:text-accent">
            {showAll ? "Open only" : "Show handled"}
          </button>
        )
      }
    >
      {shown.length === 0 && <p className="text-sm text-stone-500">All clear — nothing needs your attention.</p>}
      <ul className="space-y-2">
        {shown.map((a) => {
          const s = SEVERITY[a.severity] ?? SEVERITY.info;
          return (
            <li key={a.id} className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 ${s.box} ${a.acknowledgedAt ? "opacity-60" : ""}`}>
              <span className={`mt-0.5 text-sm font-bold ${s.icon}`} aria-hidden>
                {a.severity === "info" ? "ℹ" : "⚠"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-[11px] font-semibold uppercase tracking-wide ${s.icon}`}>{s.label}</span>
                  <span className="text-sm font-medium text-stone-900">{a.title}</span>
                  <span className="text-xs text-stone-400">{timeAgo(a.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-stone-600">{a.message}</p>
                {a.acknowledgedAt && <p className="mt-1 text-xs text-stone-400">Handled by {a.acknowledgedBy}</p>}
              </div>
              {!a.acknowledgedAt && (
                <button
                  onClick={() => ack(a.id)}
                  disabled={busy === a.id}
                  className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 shadow-sm ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-50"
                >
                  I&apos;m on it
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
