"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, ICONS, inputClass, primaryButton, timeAgo } from "@/components/Card";
import { useToast } from "@/components/ui/toast";

type Note = { id: string; body: string; createdAt: string; caregiver: { name: string } };

// Shared notes between siblings / caregivers looking after the same parent.
export function NotesThread({ elderId, notes }: { elderId: string; notes: Note[] }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/elders/${elderId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setBusy(false);
    if (res.ok) {
      setBody("");
      toast("Note shared with the family");
      router.refresh();
    }
  }

  return (
    <Card title="Family notes" icon={ICONS.note}>
      <form onSubmit={post}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="e.g. Called Papa at 6pm, BP was 130/85, all good"
          className={inputClass}
        />
        <div className="mt-2 flex justify-end">
          <button disabled={busy || !body.trim()} className={primaryButton}>
            {busy ? "Posting…" : "Post note"}
          </button>
        </div>
      </form>
      <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-stone-100 px-3 py-2">
            <div className="text-xs text-stone-400">
              <span className="font-medium text-stone-600">{n.caregiver.name}</span> · {timeAgo(n.createdAt)}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-700">{n.body}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
