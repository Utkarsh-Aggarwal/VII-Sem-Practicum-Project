import Link from "next/link";
import { ChevronLeft, CircleCheck, Phone, Plus, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { loadElderPage } from "@/lib/elder-page";
import { familyStatus } from "@/lib/dashboard";
import { initials } from "@/lib/format";
import { startOfZonedDay } from "@/lib/time";
import { ElderTabs } from "@/components/ElderTabs";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// Parent page shell: who they are, how they're doing right now, and the tabs.
export default async function ElderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { caregiver, elder } = await loadElderPage(id);
  const today = startOfZonedDay(new Date(), elder.timezone);

  const [openAlerts, checkIns, lastTalk] = await Promise.all([
    prisma.alert.findMany({ where: { elderId: id, acknowledgedAt: null }, select: { severity: true, title: true } }),
    prisma.checkIn.findMany({ where: { elderId: id, scheduledFor: { gte: today } }, include: { reminder: { select: { label: true } } } }),
    prisma.conversation.findFirst({ where: { elderId: id, summary: { not: null } }, orderBy: { startedAt: "desc" }, select: { mood: true } }),
  ]);
  const status = familyStatus({
    openAlerts,
    missedLabels: checkIns.filter((c) => c.status === "MISSED").map((c) => c.reminder.label),
    lastTalkMood: lastTalk?.mood ?? null,
    done: checkIns.filter((c) => c.status.startsWith("DONE")).length,
    total: checkIns.length,
  });
  const relation = elder.caregivers.find((c) => c.caregiverId === caregiver.id)?.relation;
  const attention = openAlerts.filter((a) => a.severity !== "info").length;

  return (
    <div>
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-accent">
        <ChevronLeft className="h-4 w-4" />
        Family
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ backgroundColor: elder.avatarColor }}>
          {initials(elder.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{elder.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={status.tone} icon={status.tone === "good" ? CircleCheck : TriangleAlert}>
              {status.label}
            </Badge>
            <span className="truncate">{status.detail}</span>
            {relation && <span className="hidden sm:inline">· your {relation.toLowerCase()}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {elder.phone && (
            <ButtonLink href={`tel:${elder.phone}`} variant="secondary" icon={Phone}>
              Call
            </ButtonLink>
          )}
          <ButtonLink href={`/elders/${id}/reminders?add=1`} icon={Plus}>
            Add reminder
          </ButtonLink>
        </div>
      </header>

      <div className="mt-6 border-b border-line">
        <ElderTabs elderId={id} openAlerts={attention} />
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}
