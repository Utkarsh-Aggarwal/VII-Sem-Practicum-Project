import { CheckInStatus } from "@/lib/types";

const STYLES: Record<CheckInStatus, string> = {
  PENDING: "bg-stone-100 text-stone-600",
  DONE_ON_TIME: "bg-[var(--success-soft)] text-[var(--success)]",
  DONE_LATE: "bg-[var(--warning-soft)] text-[var(--warning)]",
  MISSED: "bg-[var(--danger-soft)] text-[var(--danger)]",
  SKIPPED: "bg-stone-100 text-stone-500",
};

const DOT: Record<CheckInStatus, string> = {
  PENDING: "bg-stone-400",
  DONE_ON_TIME: "bg-emerald-500",
  DONE_LATE: "bg-amber-500",
  MISSED: "bg-rose-500",
  SKIPPED: "bg-stone-400",
};

const LABELS: Record<CheckInStatus, string> = {
  PENDING: "Pending",
  DONE_ON_TIME: "On time",
  DONE_LATE: "Late",
  MISSED: "Missed",
  SKIPPED: "Skipped",
};

export function StatusBadge({ status }: { status: CheckInStatus | string }) {
  const key = (status in STYLES ? status : "PENDING") as CheckInStatus;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[key]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[key]}`} />
      {LABELS[key]}
    </span>
  );
}
