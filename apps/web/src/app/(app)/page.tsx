import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CircleCheck, MessageCircle, Phone, Plus, TriangleAlert, Users } from "lucide-react";
import { currentCaregiver } from "@/lib/auth";
import { caregiverOverview, type FamilyStatus } from "@/lib/dashboard";
import { initials, timeAgo } from "@/lib/format";
import { StatusTimeline } from "@/components/StatusTimeline";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<FamilyStatus["tone"], { box: string; text: string; Icon: typeof CircleCheck }> = {
  good: { box: "bg-good-soft", text: "text-good", Icon: CircleCheck },
  warn: { box: "bg-warn-soft", text: "text-warn", Icon: TriangleAlert },
  bad: { box: "bg-bad-soft", text: "text-bad", Icon: TriangleAlert },
};

export default async function FamilyPage() {
  const caregiver = await currentCaregiver();
  if (!caregiver) redirect("/login");
  const family = await caregiverOverview(caregiver);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}, {caregiver.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-muted">Here&apos;s how your family is doing today.</p>
        </div>
        <ButtonLink href="/elders/new" icon={Plus}>
          Add a parent
        </ButtonLink>
      </div>

      {family.length === 0 && (
        <EmptyState icon={Users} title="No one added yet" action={<ButtonLink href="/elders/new" icon={Plus}>Add a parent</ButtonLink>}>
          Add a parent to set up their reminders and connect their phone.
        </EmptyState>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {family.map(({ elder, status, timeline, lastTalk }) => {
          const s = STATUS_STYLE[status.tone];
          return (
            <article key={elder.id} className="flex flex-col rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(31,41,55,0.04)] transition hover:shadow-md">
              <Link href={`/elders/${elder.id}`} className="group flex items-center gap-3 p-5 pb-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white" style={{ backgroundColor: elder.avatarColor }}>
                  {initials(elder.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-semibold group-hover:text-accent">{elder.name}</div>
                  <div className="truncate text-sm text-muted">{elder.relation}</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
              </Link>

              <div className={`mx-5 flex items-start gap-2.5 rounded-xl px-3.5 py-3 ${s.box}`}>
                <s.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.text}`} aria-hidden />
                <div className="min-w-0">
                  <p className={`font-semibold ${s.text}`}>{status.label}</p>
                  <p className="truncate text-sm text-ink/80">{status.detail}</p>
                </div>
              </div>

              <div className="space-y-3 px-5 py-4">
                {timeline.length > 0 ? (
                  <StatusTimeline items={timeline} compact />
                ) : (
                  <p className="text-sm text-muted">No reminders today.</p>
                )}
                {lastTalk && (
                  <p className="flex gap-2 text-sm text-muted">
                    <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span className="line-clamp-2">
                      <span className="font-medium text-ink">Last talk ({timeAgo(lastTalk.at)}):</span> {lastTalk.summary}
                    </span>
                  </p>
                )}
              </div>

              <div className="mt-auto flex gap-2 border-t border-line px-5 py-3">
                <ButtonLink href={`/elders/${elder.id}`} variant="ghost" size="sm">
                  Open
                </ButtonLink>
                {elder.phone && (
                  <ButtonLink href={`tel:${elder.phone}`} variant="secondary" size="sm" icon={Phone} className="ml-auto">
                    Call
                  </ButtonLink>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
