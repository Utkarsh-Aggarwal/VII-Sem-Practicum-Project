"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellRing, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { initials, timeAgo } from "@/lib/format";

type InboxAlert = {
  id: string;
  severity: string;
  title: string;
  message: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  elder: { id: string; name: string; avatarColor: string };
};

const SEVERITY = {
  critical: { label: "Urgent", Icon: TriangleAlert, text: "text-bad", bar: "bg-bad" },
  warning: { label: "Check", Icon: TriangleAlert, text: "text-warn", bar: "bg-warn" },
  info: { label: "FYI", Icon: Info, text: "text-muted", bar: "bg-stone-300" },
} as const;

// Everything that needs a caregiver's attention, across all parents.
export function AlertsInbox({ alerts, show }: { alerts: InboxAlert[]; show: "open" | "handled" }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function ack(a: InboxAlert) {
    setBusy(a.id);
    await fetch(`/api/alerts/${a.id}`, { method: "PATCH" });
    setBusy(null);
    toast("Marked as handled — the family can see you're on it");
    router.refresh();
  }

  if (!alerts.length) {
    return (
      <EmptyState icon={show === "open" ? CircleCheck : BellRing} title={show === "open" ? "All clear" : "Nothing handled yet"}>
        {show === "open" ? "Nothing needs your attention right now." : "Alerts you mark “I'm on it” appear here."}
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-3">
      {alerts.map((a) => {
        const s = SEVERITY[a.severity as keyof typeof SEVERITY] ?? SEVERITY.info;
        return (
          <li key={a.id} className="relative flex gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-4 pl-5 sm:p-5 sm:pl-6">
            <span className={`absolute inset-y-0 left-0 w-1.5 ${s.bar}`} aria-hidden />
            <Link href={`/elders/${a.elder.id}`} className="hidden sm:block">
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: a.elder.avatarColor }}>
                {initials(a.elder.name)}
              </span>
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className={`inline-flex items-center gap-1 font-semibold ${s.text}`}>
                  <s.Icon className="h-4 w-4" aria-hidden />
                  {s.label}
                </span>
                <Link href={`/elders/${a.elder.id}`} className="font-medium hover:text-accent">
                  {a.elder.name}
                </Link>
                <span className="text-muted">· {timeAgo(a.createdAt)}</span>
              </div>
              <p className="mt-1 font-semibold">{a.title}</p>
              <p className="mt-0.5 text-sm text-muted">{a.message}</p>
              {a.acknowledgedAt && <p className="mt-2 text-xs text-good">✓ Handled by {a.acknowledgedBy}</p>}
            </div>
            {!a.acknowledgedAt && (
              <Button variant="secondary" size="sm" loading={busy === a.id} onClick={() => ack(a)} className="self-start">
                I&apos;m on it
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
