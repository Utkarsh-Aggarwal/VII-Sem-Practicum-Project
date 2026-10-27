"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, House, LogOut, Settings, type LucideIcon } from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; badge?: number };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" || pathname.startsWith("/elders") : pathname.startsWith(href);
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-semibold text-ink">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
        </svg>
      </span>
      <span className="text-[16px] tracking-tight">CareCircle</span>
    </Link>
  );
}

// Sidebar on desktop, bottom bar on phones.
export function AppNav({ name, alertCount }: { name: string; alertCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const items: Item[] = [
    { href: "/", label: "Family", icon: House },
    { href: "/alerts", label: "Alerts", icon: Bell, badge: alertCount },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface px-4 py-5 md:flex">
        <Logo />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {items.map(({ href, label, icon: Icon, badge }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition ${
                  active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
                {!!badge && <span className="ml-auto rounded-full bg-bad px-2 py-0.5 text-xs font-semibold text-white">{badge}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <p className="truncate px-3 text-sm font-medium text-ink">{name}</p>
          <button onClick={signOut} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-ink">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Main">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${active ? "text-accent" : "text-muted"}`}>
              <Icon className="h-6 w-6" />
              {label}
              {!!badge && <span className="absolute right-[30%] top-1.5 rounded-full bg-bad px-1.5 text-[10px] font-semibold text-white">{badge}</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
