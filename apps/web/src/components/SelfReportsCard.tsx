import { Card, ICONS, timeAgo } from "@/components/Card";

type Report = { id: string; kind: string; answer: string; text: string | null; score: number | null; source: string; createdAt: string };

const KIND: Record<string, { emoji: string; label: string }> = {
  FEELING: { emoji: "💛", label: "Feeling" },
  MEAL: { emoji: "🍽️", label: "Meal" },
  SLEEP: { emoji: "🌙", label: "Sleep" },
  ACTIVITY: { emoji: "🚶", label: "Activity" },
  SOCIAL: { emoji: "📞", label: "Social" },
};

function tone(score: number | null) {
  if (score === null) return "text-stone-600";
  if (score >= 0.3) return "text-[var(--success)]";
  if (score <= -0.3) return "text-[var(--danger)]";
  return "text-stone-600";
}

export function SelfReportsCard({ reports }: { reports: Report[] }) {
  return (
    <Card title="Wellbeing self-reports" icon={ICONS.clipboard}>
      {reports.length === 0 && <p className="text-sm text-stone-500">No self-reports in the last week.</p>}
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {reports.map((r) => {
          const k = KIND[r.kind] ?? { emoji: "•", label: r.kind };
          return (
            <li key={r.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-stone-50">
              <span className="text-base" aria-hidden>{k.emoji}</span>
              <div className="min-w-0 flex-1">
                <span className="text-stone-500">{k.label}: </span>
                <span className={`font-medium ${tone(r.score)}`}>{r.answer.replace("_", " ")}</span>
                {r.source === "chat" && r.text && <p className="truncate text-xs text-stone-400">from chat: “{r.text}”</p>}
              </div>
              <span className="shrink-0 text-xs text-stone-400">{timeAgo(r.createdAt)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
