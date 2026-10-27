import { CheckInStatus } from "@/lib/types";

// Today's reminders as a row of coloured dots in time order (GUARDIAN-style dot legend).
// Colour is never the only cue: each dot carries a symbol, and the full label is in the tooltip/list.

const DOT: Record<CheckInStatus, { bg: string; symbol: string; label: string }> = {
  DONE_ON_TIME: { bg: "bg-emerald-500", symbol: "✓", label: "Done on time" },
  DONE_LATE: { bg: "bg-amber-500", symbol: "✓", label: "Done late" },
  MISSED: { bg: "bg-rose-500", symbol: "✕", label: "Missed" },
  SKIPPED: { bg: "bg-stone-400", symbol: "–", label: "Skipped" },
  PENDING: { bg: "bg-stone-200", symbol: "", label: "Waiting" },
};

type Item = { id: string; label: string; time: string; status: string };

export function StatusTimeline({ items, compact = false }: { items: Item[]; compact?: boolean }) {
  return (
    <ol className={`flex flex-wrap items-start ${compact ? "gap-1.5" : "gap-3"}`} aria-label="Today's reminders">
      {items.map((item) => {
        const d = DOT[(item.status in DOT ? item.status : "PENDING") as CheckInStatus];
        return (
          <li key={item.id} className="group relative flex flex-col items-center" title={`${item.time} ${item.label} — ${d.label}`}>
            <span
              className={`flex items-center justify-center rounded-full font-bold text-white ${d.bg} ${
                compact ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs"
              } ${item.status === "PENDING" ? "ring-1 ring-inset ring-stone-300" : ""}`}
            >
              {d.symbol}
            </span>
            {!compact && (
              <span className="mt-1 max-w-[72px] truncate text-center text-[11px] leading-tight text-stone-500">
                <span className="font-mono text-stone-400">{item.time}</span>
                <br />
                {item.label}
              </span>
            )}
            <span className="sr-only">{`${item.time} ${item.label}: ${d.label}`}</span>
          </li>
        );
      })}
    </ol>
  );
}
