import { Card, ICONS } from "@/components/Card";
import { Z_THRESHOLD, MIN_BASELINE_DAYS, type DayAssessment, type DayFeatures } from "@/lib/ai/routine";
import { formatMinutes } from "@/lib/time";

type Day = DayFeatures & { score: number; flagged: boolean };

export type Insights = {
  days: Day[];
  today: DayAssessment;
  todayIsPartial: boolean;
  lateStart: { late: boolean; usual?: number };
};

const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });

const dash = "—";

// Routine-deviation view: how unusual each of the last two weeks' days was compared to the senior's
// own baseline, plus a plain-language explanation for today.
export function RoutineInsights({ insights, elderName }: { insights: Insights; elderName: string }) {
  const first = elderName.split(" ")[0];
  const { days, today, todayIsPartial, lateStart } = insights;
  const learning = today.baselineDays < MIN_BASELINE_DAYS;
  const maxScore = Math.max(Z_THRESHOLD * 1.4, ...days.map((d) => d.score));

  return (
    <Card title="Routine insights" icon={ICONS.sparkle}>
      {learning ? (
        <p className="rounded-lg bg-stone-50 px-4 py-4 text-sm text-stone-600">
          Still learning {first}&apos;s usual routine — it needs about {MIN_BASELINE_DAYS} days of check-ins or hub
          activity before it can spot unusual days ({today.baselineDays}/{MIN_BASELINE_DAYS} so far).
        </p>
      ) : today.deviations.length || lateStart.late ? (
        <div className="rounded-xl border border-amber-200 bg-[var(--warning-soft)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--warning)]">⚠ Today looks different from {first}&apos;s usual routine</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-stone-700">
            {lateStart.late && lateStart.usual !== undefined && (
              <li>No activity yet — usually up and about by {formatMinutes(lateStart.usual)}</li>
            )}
            {today.deviations.map((d) => (
              <li key={d.key}>{d.explanation}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-lg bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          ✓ Today looks like a normal day for {first}
          {todayIsPartial ? " so far" : ""}.
        </p>
      )}

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="font-medium text-stone-500">How unusual each day was (vs. {first}&apos;s own baseline)</span>
          <span className="text-stone-400">dashed line = alert threshold</span>
        </div>
        <div className="relative flex h-28 items-end gap-1.5" role="img" aria-label="Routine deviation score per day">
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-stone-300"
            style={{ bottom: `${(Z_THRESHOLD / maxScore) * 100}%` }}
          />
          {days.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              {d.flagged && <span className="mb-0.5 text-[10px] text-[var(--warning)]">⚠</span>}
              <div
                className={`w-full max-w-7 rounded-t-[4px] transition ${
                  d.flagged ? "bg-amber-500 group-hover:bg-amber-600" : "bg-accent/60 group-hover:bg-accent"
                }`}
                style={{ height: d.score ? `${Math.max(4, (d.score / maxScore) * 100)}%` : "2px" }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-44 -translate-x-1/2 rounded-md bg-stone-900 px-2.5 py-2 text-[11px] leading-relaxed text-white group-hover:block">
                <div className="font-semibold">{fmtDay(d.day)} · score {d.score.toFixed(1)}</div>
                <div>First activity: {d.firstActivityMin !== null ? formatMinutes(d.firstActivityMin) : dash}</div>
                <div>Reminders done: {d.adherence !== null ? `${Math.round(d.adherence * 100)}%` : dash}</div>
                <div>Meals: {d.mealReports ?? dash} · Movement: {d.activityCount ?? dash}</div>
                <div>Wellbeing: {d.wellbeing !== null ? d.wellbeing.toFixed(2) : dash}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5">
          {days.map((d, i) => (
            <span key={d.day} className="flex-1 text-center text-[10px] text-stone-400">
              {i % 2 === (days.length - 1) % 2 ? fmtDay(d.day).split(" ")[0] : ""}
            </span>
          ))}
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-stone-500 hover:text-accent">Show as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-stone-400">
              <tr>
                <th className="py-1 pr-3 font-medium">Day</th>
                <th className="py-1 pr-3 font-medium">First activity</th>
                <th className="py-1 pr-3 font-medium">Done</th>
                <th className="py-1 pr-3 font-medium">Meals</th>
                <th className="py-1 pr-3 font-medium">Movement</th>
                <th className="py-1 pr-3 font-medium">Wellbeing</th>
                <th className="py-1 font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="text-stone-600">
              {[...days].reverse().map((d) => (
                <tr key={d.day} className="border-t border-stone-100">
                  <td className="py-1 pr-3">{fmtDay(d.day)}</td>
                  <td className="py-1 pr-3 font-mono">{d.firstActivityMin !== null ? formatMinutes(d.firstActivityMin) : dash}</td>
                  <td className="py-1 pr-3">{d.adherence !== null ? `${Math.round(d.adherence * 100)}%` : dash}</td>
                  <td className="py-1 pr-3">{d.mealReports ?? dash}</td>
                  <td className="py-1 pr-3">{d.activityCount ?? dash}</td>
                  <td className="py-1 pr-3">{d.wellbeing !== null ? d.wellbeing.toFixed(2) : dash}</td>
                  <td className="py-1">{d.flagged ? `⚠ ${d.score.toFixed(1)}` : d.score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
