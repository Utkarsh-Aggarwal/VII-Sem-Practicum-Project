"use client";

import { useMemo } from "react";

type CheckIn = {
  scheduledFor: string;
  status: string;
};

const STATUS_COLOR: Record<string, string> = {
  DONE_ON_TIME: "#10b981",
  DONE_LATE: "#f59e0b",
  MISSED: "#f43f5e",
  SKIPPED: "#cbd5e1",
  PENDING: "#e2e8f0",
};

export function AdherenceChart({ checkIns }: { checkIns: CheckIn[] }) {
  const days = useMemo(() => {
    const buckets: { label: string; date: string; counts: Record<string, number>; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      buckets.push({
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        date: key,
        counts: {},
        total: 0,
      });
    }
    for (const c of checkIns) {
      const key = new Date(c.scheduledFor).toDateString();
      const bucket = buckets.find((b) => b.date === key);
      if (!bucket) continue;
      bucket.counts[c.status] = (bucket.counts[c.status] || 0) + 1;
      bucket.total += 1;
    }
    return buckets;
  }, [checkIns]);

  const maxTotal = Math.max(1, ...days.map((d) => d.total));

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-medium text-stone-900">
          <svg
            className="h-4 w-4 text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M8 17V10m5 7V6m5 11v-4" />
          </svg>
          Last 7 days
        </h2>
        <div className="flex gap-3 text-xs text-stone-500">
          <Legend color={STATUS_COLOR.DONE_ON_TIME} label="On time" />
          <Legend color={STATUS_COLOR.DONE_LATE} label="Late" />
          <Legend color={STATUS_COLOR.MISSED} label="Missed" />
        </div>
      </div>
      <div className="flex h-40 items-end justify-between gap-3">
        {days.map((day) => (
          <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-32 w-full flex-col-reverse overflow-hidden rounded-lg bg-stone-50">
              {(["DONE_ON_TIME", "DONE_LATE", "MISSED", "SKIPPED"] as const).map((status) => {
                const count = day.counts[status] || 0;
                if (!count) return null;
                const heightPct = (count / maxTotal) * 100;
                return (
                  <div
                    key={status}
                    style={{ height: `${heightPct}%`, backgroundColor: STATUS_COLOR[status] }}
                    title={`${status}: ${count}`}
                  />
                );
              })}
            </div>
            <span className="text-[11px] font-medium text-stone-400">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
