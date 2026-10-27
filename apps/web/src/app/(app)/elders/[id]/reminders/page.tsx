import { prisma } from "@/lib/prisma";
import { loadElderPage, plain } from "@/lib/elder-page";
import { ReminderManager } from "@/components/ReminderManager";
import { AdherenceChart } from "@/components/AdherenceChart";
import { CheckInHistory } from "@/components/CheckInHistory";

export const dynamic = "force-dynamic";

export default async function RemindersTab({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ add?: string }> }) {
  const { id } = await params;
  const { add } = await searchParams;
  await loadElderPage(id);
  const now = new Date();
  const since = new Date(now.getTime() - 13 * 24 * 3600_000);
  const [reminders, checkIns] = await Promise.all([
    prisma.reminder.findMany({ where: { elderId: id }, orderBy: { time: "asc" } }),
    prisma.checkIn.findMany({
      where: { elderId: id, scheduledFor: { gte: since, lte: now } },
      include: { reminder: true },
      orderBy: { scheduledFor: "desc" },
    }),
  ]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <ReminderManager elderId={id} reminders={plain(reminders)} startAdding={add === "1"} />
      </div>
      <div className="space-y-5 lg:col-span-2">
        <AdherenceChart checkIns={plain(checkIns)} />
        <CheckInHistory checkIns={plain(checkIns)} />
      </div>
    </div>
  );
}
