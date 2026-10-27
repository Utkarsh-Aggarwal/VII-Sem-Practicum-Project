import { redirect } from "next/navigation";
import { currentCaregiver } from "@/lib/auth";
import { AccountSettings } from "@/components/AccountSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const caregiver = await currentCaregiver();
  if (!caregiver) redirect("/login");
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 mb-6 text-muted">Your account. Each parent&apos;s own settings are on their page.</p>
      <AccountSettings name={caregiver.name} email={caregiver.email} />
    </div>
  );
}
