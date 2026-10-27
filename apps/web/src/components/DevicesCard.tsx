"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw, Router, Smartphone } from "lucide-react";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/format";

type Device = { id: string; kind: string; name: string; online: boolean; lastSeenAt: string | null; pushEnabled: boolean };

// Pairing code for the senior app / home hub, how to use it, and the paired devices.
export function DevicesCard({
  elderId,
  elderName,
  pairingCode,
  devices,
}: {
  elderId: string;
  elderName: string;
  pairingCode: string | null;
  devices: Device[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [code, setCode] = useState(pairingCode);
  const first = elderName.split(" ")[0];

  async function regenerate() {
    const ok = await confirm({ title: "Make a new pairing code?", message: "Phones and hubs that are already connected keep working.", confirmLabel: "New code" });
    if (!ok) return;
    const res = await fetch(`/api/elders/${elderId}/pairing`, { method: "POST" });
    if (res.ok) {
      setCode((await res.json()).pairingCode);
      toast("New pairing code ready");
    }
  }

  async function unpair(d: Device) {
    const ok = await confirm({
      title: `Disconnect “${d.name}”?`,
      message: "It stops getting reminders until it's paired again with the code.",
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/devices/${d.id}`, { method: "DELETE" });
    toast(`${d.name} disconnected`);
    router.refresh();
  }

  return (
    <Card title={`Connect ${first}'s phone`} icon={Smartphone}>
      <div className="rounded-2xl bg-accent-soft p-5 text-center">
        <p className="text-sm font-medium text-accent">Pairing code</p>
        <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.3em] text-ink">{code ?? "------"}</p>
        <div className="mt-3 flex justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={Copy}
            onClick={() => {
              if (code) navigator.clipboard?.writeText(code);
              toast("Code copied");
            }}
          >
            Copy
          </Button>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={regenerate}>
            New code
          </Button>
        </div>
      </div>

      <ol className="mt-4 space-y-2 text-sm text-muted">
        {[
          `Open the CareCircle app on ${first}'s phone.`,
          "Choose the language, then tap “Patient”.",
          "Enter the pairing code above and tap Connect.",
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>

      <h3 className="mt-6 text-sm font-semibold">Connected devices</h3>
      <ul className="mt-2 divide-y divide-line">
        {devices.length === 0 && <li className="py-3 text-sm text-muted">Nothing connected yet.</li>}
        {devices.map((d) => {
          const Icon = d.kind === "HUB" ? Router : Smartphone;
          return (
            <li key={d.id} className="flex items-center gap-3 py-3">
              <Icon className="h-5 w-5 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.name}</div>
                <div className="text-xs text-muted">
                  {d.lastSeenAt ? `Seen ${timeAgo(d.lastSeenAt)}` : "Never seen"}
                  {d.kind === "APP" && (d.pushEnabled ? " · notifications on" : "")}
                </div>
              </div>
              <Badge tone={d.online ? "good" : "neutral"}>{d.online ? "Online" : "Offline"}</Badge>
              <button onClick={() => unpair(d)} className="text-xs font-medium text-muted hover:text-bad">
                Disconnect
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
