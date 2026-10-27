"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function DangerZone({ elderId, elderName }: { elderId: string; elderName: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  async function remove() {
    const ok = await confirm({
      title: `Remove ${elderName}?`,
      message: "This deletes their reminders, history, conversations and paired devices for everyone in the family. This can't be undone.",
      confirmLabel: "Remove permanently",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/elders/${elderId}`, { method: "DELETE" });
    if (!res.ok) return toast("Couldn't remove them", "bad");
    toast(`${elderName} removed`);
    router.replace("/");
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-bad/20 bg-surface p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold text-bad">Remove {elderName.split(" ")[0]}</h2>
      <p className="mt-1 text-sm text-muted">Deletes their profile and all data for every caregiver.</p>
      <Button variant="secondary" icon={Trash2} className="mt-4 text-bad" onClick={remove}>
        Remove profile
      </Button>
    </section>
  );
}
