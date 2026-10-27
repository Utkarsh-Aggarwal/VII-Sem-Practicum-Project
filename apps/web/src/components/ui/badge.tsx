import type { LucideIcon } from "lucide-react";

export type Tone = "good" | "warn" | "bad" | "neutral" | "accent";

const TONE: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", icon: Icon, children, className = "" }: { tone?: Tone; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]} ${className}`}>
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  );
}
