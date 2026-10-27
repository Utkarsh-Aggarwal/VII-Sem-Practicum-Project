import { Card, ICONS, timeAgo } from "@/components/Card";

export type Environment = {
  readings: Record<string, { value: number; at: string }>;
  hubs: { id: string; name: string; online: boolean; lastSeenAt: string | null }[];
  activeSince: string | null;
  lastMotionAt: string | null;
  motionByHour: number[];
};

const TILES: { kind: string; label: string; unit: string; digits: number }[] = [
  { kind: "temperature", label: "Temperature", unit: "°C", digits: 1 },
  { kind: "humidity", label: "Humidity", unit: "%", digits: 0 },
  { kind: "air_quality", label: "Air quality", unit: "", digits: 0 },
  { kind: "sound_level", label: "Sound level", unit: "", digits: 0 },
];

function clock(iso: string, timezone: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
}

export function EnvironmentCard({ env, timezone, elderName }: { env: Environment; timezone: string; elderName: string }) {
  const first = elderName.split(" ")[0];
  const hasHub = env.hubs.length > 0;
  const online = env.hubs.some((h) => h.online);
  const max = Math.max(1, ...env.motionByHour);
  const tiles = TILES.filter((t) => env.readings[t.kind]);

  return (
    <Card
      title="Home & activity"
      icon={ICONS.home}
      action={
        hasHub && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              online ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-500"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-stone-400"}`} />
            Hub {online ? "online" : "offline"}
          </span>
        )
      }
    >
      {!hasHub ? (
        <p className="rounded-lg bg-stone-50 px-4 py-5 text-center text-sm text-stone-500">
          No home hub paired yet. Once the hub is set up (see <span className="font-medium">Devices</span>), you&apos;ll see
          room temperature, humidity and when {first} is up and about.
        </p>
      ) : (
        <>
          <p className="text-sm text-stone-700">
            {env.activeSince ? (
              <>
                <span className="font-medium">Active since {clock(env.activeSince, timezone)}</span>
                {env.lastMotionAt && <span className="text-stone-500"> · last movement {timeAgo(env.lastMotionAt)}</span>}
              </>
            ) : (
              <span className="font-medium text-[var(--warning)]">⚠ No movement detected today yet</span>
            )}
          </p>

          {tiles.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.kind} className="rounded-xl bg-stone-50 px-3 py-2.5">
                  <div className="text-[11px] font-medium text-stone-500">{t.label}</div>
                  <div className="text-lg font-semibold text-stone-900">
                    {env.readings[t.kind].value.toFixed(t.digits)}
                    <span className="text-xs font-medium text-stone-500">{t.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5">
            <div className="mb-2 text-xs font-medium text-stone-500">Movement in the room today, by hour</div>
            <div className="flex h-16 items-end gap-[2px]" role="img" aria-label="Movement events per hour today">
              {env.motionByHour.map((v, h) => (
                <div key={h} className="group relative flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-[4px] bg-accent/80 transition group-hover:bg-accent"
                    style={{ height: v ? `${Math.max(6, (v / max) * 100)}%` : "2px", opacity: v ? 1 : 0.25 }}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-[11px] text-white group-hover:block">
                    {String(h).padStart(2, "0")}:00 · {v} movement{v === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-stone-400">
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
