import { History } from "lucide-react";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";

type CheckIn = { id: string; scheduledFor: string; status: string; channel?: string | null; reminder: { label: string } };

const CHANNEL: Record<string, string> = { app: "app", hub: "hub button", voice: "by voice", chat: "in chat", dashboard: "dashboard" };

export function CheckInHistory({ checkIns }: { checkIns: CheckIn[] }) {
  return (
    <Card title="History" icon={History} description="Last 2 weeks">
      {checkIns.length === 0 ? (
        <p className="text-sm text-muted">No check-ins yet.</p>
      ) : (
        <ul className="-mx-2 max-h-[28rem] space-y-0.5 overflow-y-auto">
          {checkIns.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{c.reminder.label}</div>
                <div className="text-xs text-muted">
                  {new Date(c.scheduledFor).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  {c.channel && c.status.startsWith("DONE") ? ` · ${CHANNEL[c.channel] ?? c.channel}` : ""}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
