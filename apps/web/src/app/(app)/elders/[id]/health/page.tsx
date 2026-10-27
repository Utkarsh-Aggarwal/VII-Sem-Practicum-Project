import { prisma } from "@/lib/prisma";
import { loadElderPage, plain } from "@/lib/elder-page";
import { getEnvironment } from "@/lib/dashboard";
import { getRoutineInsights } from "@/lib/ai/routine-service";
import { EnvironmentCard } from "@/components/EnvironmentCard";
import { RoutineInsights } from "@/components/RoutineInsights";
import { SelfReportsCard } from "@/components/SelfReportsCard";
import { MoodHistory } from "@/components/MoodHistory";
import { LiveFeed } from "@/components/LiveFeed";

export const dynamic = "force-dynamic";

export default async function HealthTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { elder } = await loadElderPage(id);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  const [env, insights, reports, moods] = await Promise.all([
    getEnvironment(elder),
    getRoutineInsights(elder),
    prisma.selfReport.findMany({ where: { elderId: id, createdAt: { gte: weekAgo } }, orderBy: { createdAt: "desc" } }),
    prisma.moodLog.findMany({ where: { elderId: id }, orderBy: { createdAt: "desc" }, take: 7 }),
  ]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <RoutineInsights insights={plain(insights)} elderName={elder.name} />
        <EnvironmentCard env={plain(env)} timezone={elder.timezone} elderName={elder.name} />
        <LiveFeed elderId={id} elderName={elder.name} cameraUrl={elder.cameraUrl} />
      </div>
      <div className="space-y-5 lg:col-span-2">
        <MoodHistory moods={plain(moods)} />
        <SelfReportsCard reports={plain(reports)} />
      </div>
    </div>
  );
}
