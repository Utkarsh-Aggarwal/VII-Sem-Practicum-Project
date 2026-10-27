import Link from "next/link";
import { ArrowRight, CalendarClock, Circle, CircleCheck, House, MessageCircle, Thermometer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { loadConversations, loadElderPage, plain } from "@/lib/elder-page";
import { ensureTodayCheckIns } from "@/lib/checkins";
import { getEnvironment, listAlerts } from "@/lib/dashboard";
import { formatTime12, timeAgo } from "@/lib/format";
import { AlertsPanel } from "@/components/AlertsPanel";
import { StatusTimeline } from "@/components/StatusTimeline";
import { ConversationsCard } from "@/components/ConversationsCard";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";

// Overview: only what matters today.
export default async function ElderOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { elder } = await loadElderPage(id);
  const first = elder.name.split(" ")[0];

  const [today, alerts, conversations, env, deviceCount, reminderCount] = await Promise.all([
    ensureTodayCheckIns(elder),
    listAlerts(id, { onlyOpen: true, take: 10 }),
    loadConversations(id, 1),
    getEnvironment(elder),
    prisma.device.count({ where: { elderId: id } }),
    prisma.reminder.count({ where: { elderId: id } }),
  ]);

  const setup = [
    { done: reminderCount > 0, label: "Add their first reminder", href: `/elders/${id}/reminders?add=1` },
    { done: deviceCount > 0, label: `Connect ${first}'s phone with the pairing code`, href: `/elders/${id}/settings` },
    { done: !!elder.profile, label: `Tell the companion about ${first}`, href: `/elders/${id}/settings` },
  ];
  const setupLeft = setup.filter((s) => !s.done).length;
  const temp = env.readings.temperature?.value;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        {alerts.length > 0 && <AlertsPanel alerts={plain(alerts)} />}

        <Card
          title="Today"
          icon={CalendarClock}
          action={
            <Link href={`/elders/${id}/reminders`} className="text-sm font-medium text-accent hover:underline">
              Manage
            </Link>
          }
        >
          {today.length === 0 ? (
            <p className="text-sm text-muted">No reminders today.</p>
          ) : (
            <StatusTimeline
              items={today.map(({ reminder, checkIn }) => ({ id: checkIn.id, label: reminder.label, time: formatTime12(reminder.time), status: checkIn.status }))}
            />
          )}
        </Card>

        {conversations.length > 0 ? (
          <div>
            <ConversationsCard conversations={conversations} elderName={elder.name} title="Latest conversation" />
            <Link href={`/elders/${id}/conversations`} className="mt-2 inline-flex items-center gap-1 px-1 text-sm font-medium text-accent hover:underline">
              All conversations <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <Card title="Conversations" icon={MessageCircle}>
            <p className="text-sm text-muted">When {first} talks to the companion, a short summary of each chat appears here.</p>
          </Card>
        )}
      </div>

      <div className="space-y-5 lg:col-span-2">
        {setupLeft > 0 && (
          <Card title="Finish setting up" description={`${setup.length - setupLeft} of ${setup.length} done`}>
            <ul className="space-y-1">
              {setup.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-surface-2">
                    {s.done ? <CircleCheck className="h-5 w-5 text-good" /> : <Circle className="h-5 w-5 text-muted" />}
                    <span className={s.done ? "text-muted line-through" : "font-medium"}>{s.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card
          title="At home"
          icon={House}
          action={
            <Link href={`/elders/${id}/health`} className="text-sm font-medium text-accent hover:underline">
              Details
            </Link>
          }
        >
          {env.hubs.length === 0 ? (
            <p className="text-sm text-muted">No home hub connected yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              <li>{env.activeSince ? `Up and about since ${new Date(env.activeSince).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: elder.timezone })}` : "No movement detected yet today"}</li>
              {env.lastMotionAt && <li className="text-muted">Last movement {timeAgo(env.lastMotionAt)}</li>}
              {temp !== undefined && (
                <li className="flex items-center gap-1.5 text-muted">
                  <Thermometer className="h-4 w-4" /> Room {temp.toFixed(0)}°C
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
