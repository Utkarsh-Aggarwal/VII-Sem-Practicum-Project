import {
  Bell,
  CalendarClock,
  House,
  MessageCircle,
  Settings,
  Smartphone,
  Sparkles,
  StickyNote,
  TriangleAlert,
  Users,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import { inputClass as fieldInputClass } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";

export { timeAgo } from "@/lib/format";

// Section card used across the dashboard.
export function Card({
  title,
  icon: Icon,
  action,
  children,
  className = "",
  description,
}: {
  title?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(31,41,55,0.04)] sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                {Icon && <Icon className="h-[18px] w-[18px] text-accent" aria-hidden />}
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export const ICONS = {
  alert: TriangleAlert,
  home: House,
  sparkle: Sparkles,
  chat: MessageCircle,
  clipboard: HeartPulse,
  note: StickyNote,
  device: Smartphone,
  users: Users,
  settings: Settings,
  today: CalendarClock,
  bell: Bell,
};

export const inputClass = fieldInputClass;
export const primaryButton = buttonClass("primary", "md");
