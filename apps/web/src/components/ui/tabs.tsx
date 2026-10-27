"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export type TabItem = { href: string; label: string; icon: LucideIcon; badge?: number; exact?: boolean };

// Link-based tabs: each tab is its own URL, so it can be bookmarked and the back button works.
export function Tabs({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Sections">
      {items.map(({ href, label, icon: Icon, badge, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              active ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {!!badge && <span className="rounded-full bg-bad px-1.5 text-[11px] font-semibold text-white">{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
