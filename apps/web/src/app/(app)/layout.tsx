import { redirect } from "next/navigation";
import { currentCaregiver } from "@/lib/auth";
import { openAlertCount } from "@/lib/dashboard";
import { AppNav } from "@/components/AppNav";
import { LiveUpdates } from "@/components/LiveUpdates";

export const dynamic = "force-dynamic";

// Signed-in shell: sidebar (desktop) / bottom nav (phone) around every dashboard page.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const caregiver = await currentCaregiver();
  if (!caregiver) redirect("/login");
  const alerts = await openAlertCount(caregiver.id);

  return (
    <div className="min-h-screen">
      <AppNav name={caregiver.name} alertCount={alerts} />
      <LiveUpdates />
      <main className="pb-24 md:pb-10 md:pl-60">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-10">{children}</div>
      </main>
    </div>
  );
}
