"use client";

import { CalendarClock, HeartPulse, LayoutDashboard, MessageCircle, Settings, Users } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";

export function ElderTabs({ elderId, openAlerts }: { elderId: string; openAlerts: number }) {
  const base = `/elders/${elderId}`;
  return (
    <Tabs
      items={[
        { href: base, label: "Overview", icon: LayoutDashboard, exact: true, badge: openAlerts },
        { href: `${base}/reminders`, label: "Reminders", icon: CalendarClock },
        { href: `${base}/conversations`, label: "Conversations", icon: MessageCircle },
        { href: `${base}/health`, label: "Health & home", icon: HeartPulse },
        { href: `${base}/family`, label: "Family", icon: Users },
        { href: `${base}/settings`, label: "Settings", icon: Settings },
      ]}
    />
  );
}
