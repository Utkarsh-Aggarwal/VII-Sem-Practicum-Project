"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, ICONS, inputClass } from "@/components/Card";
import { useConfirm } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Link = { relation: string; caregiver: { id: string; name: string; email: string } };

export function CaregiversCard({ elderId, links, meId }: { elderId: string; links: Link[]; meId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState("Son");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/elders/${elderId}/caregivers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, relation }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't add them");
      return;
    }
    setEmail("");
    toast("Caregiver added");
    router.refresh();
  }

  async function remove(caregiverId: string) {
    if (!(await confirm({ title: "Remove this caregiver?", message: "They will no longer see this profile.", confirmLabel: "Remove", danger: true }))) return;
    const res = await fetch(`/api/elders/${elderId}/caregivers?caregiverId=${caregiverId}`, { method: "DELETE" });
    if (!res.ok) toast((await res.json()).error ?? "Couldn't remove them", "bad");
    else if (caregiverId === meId) router.push("/");
    else router.refresh();
  }

  return (
    <Card title="Family caregivers" icon={ICONS.users}>
      <ul className="space-y-1.5">
        {links.map((l) => (
          <li key={l.caregiver.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium text-stone-800">{l.caregiver.name}</span>
              <span className="text-stone-400"> · {l.relation}{l.caregiver.id === meId ? " (you)" : ""}</span>
            </span>
            {links.length > 1 && (
              <button onClick={() => remove(l.caregiver.id)} className="text-xs text-stone-400 hover:text-rose-600">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={invite} className="mt-3 border-t border-stone-100 pt-3">
        <label className="block text-xs font-medium text-stone-600">Share with a sibling (they need an account)</label>
        <div className="flex gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className={inputClass} />
          <select value={relation} onChange={(e) => setRelation(e.target.value)} className={`${inputClass} w-28`}>
            {["Son", "Daughter", "Grandchild", "Relative", "Nurse"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
        <button disabled={busy} className="mt-2 text-xs font-medium text-accent hover:underline disabled:opacity-50">
          {busy ? "Adding…" : "Add caregiver"}
        </button>
      </form>
    </Card>
  );
}
