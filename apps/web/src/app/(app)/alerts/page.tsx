import Link from "next/link";
import { redirect } from "next/navigation";
import { currentCaregiver } from "@/lib/auth";
import { caregiverAlerts } from "@/lib/dashboard";
import { plain } from "@/lib/elder-page";
import { AlertsInbox } from "@/components/AlertsInbox";

export const dynamic = "force-dynamic";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const caregiver = await currentCaregiver();
  if (!caregiver) redirect("/login");
  const show = (await searchParams).show === "handled" ? "handled" : "open";
  const all = await caregiverAlerts(caregiver.id, { take: 150 });
  const open = all.filter((a) => !a.acknowledgedAt);
  const handled = all.filter((a) => a.acknowledgedAt);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
      <p className="mt-1 text-muted">Things that need someone in the family to check.</p>

      <div className="mt-6 mb-5 inline-flex rounded-xl bg-surface-2 p-1 text-sm font-medium">
        {(
          [
            ["open", `Open (${open.length})`],
            ["handled", "Handled"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === "open" ? "/alerts" : "/alerts?show=handled"}
            className={`rounded-lg px-4 py-1.5 transition ${show === key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <AlertsInbox alerts={plain(show === "open" ? open : handled.slice(0, 50))} show={show} />
    </div>
  );
}
