"use client";

import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";

// Lets the family see how the companion would respond. Nothing is saved and no alerts fire.
export function CompanionPanel({ elderId, elderName, llm }: { elderId: string; elderName: string; llm: string | null }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ q: string; reply: string; usedLlm: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const first = elderName.split(" ")[0];

  async function tryIt(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const q = text;
    setText("");
    const res = await fetch(`/api/elders/${elderId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: q }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setPreview((p) => [{ q, reply: data.reply, usedLlm: data.usedLlm }, ...p].slice(0, 5));
  }

  return (
    <Card title="Try the companion" icon={Bot} description={`See how Saathi would answer ${first}. Nothing is saved.`}>
      <form onSubmit={tryIt} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Mujhe aaj akela lag raha hai" className={`${inputClass} mt-0`} />
        <Button type="submit" loading={busy} icon={Send} aria-label="Send" />
      </form>
      <ul className="mt-4 space-y-3">
        {preview.map((p, i) => (
          <li key={i} className="space-y-1.5 text-sm">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-3 py-2">{p.q}</p>
            <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-accent-soft px-3 py-2 text-ink">{p.reply}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">{llm ? `AI model: ${llm}` : "AI model not configured: using built-in replies"}</p>
    </Card>
  );
}
