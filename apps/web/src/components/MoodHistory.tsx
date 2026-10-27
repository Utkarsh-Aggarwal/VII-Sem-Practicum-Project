import { Smile } from "lucide-react";
import { Card } from "@/components/Card";
import { Badge, type Tone } from "@/components/ui/badge";

type Mood = { id: string; mood: string; note: string | null; createdAt: string };

const MOOD: Record<string, { label: string; tone: Tone; emoji: string }> = {
  great: { label: "Great", tone: "good", emoji: "😄" },
  okay: { label: "Okay", tone: "neutral", emoji: "🙂" },
  not_great: { label: "Not great", tone: "warn", emoji: "😕" },
};

export function MoodHistory({ moods }: { moods: Mood[] }) {
  return (
    <Card title="Mood" icon={Smile} description="What they tapped in the app">
      {moods.length === 0 ? (
        <p className="text-sm text-muted">No mood check-ins yet.</p>
      ) : (
        <ul className="space-y-2">
          {moods.map((m) => {
            const s = MOOD[m.mood] ?? MOOD.okay;
            return (
              <li key={m.id} className="flex items-center gap-3 text-sm">
                <span className="text-lg" aria-hidden>
                  {s.emoji}
                </span>
                <Badge tone={s.tone}>{s.label}</Badge>
                {m.note && <span className="truncate text-muted">{m.note}</span>}
                <span className="ml-auto shrink-0 text-xs text-muted">{new Date(m.createdAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
