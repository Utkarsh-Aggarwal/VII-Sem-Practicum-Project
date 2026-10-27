"use client";

import { useState } from "react";
import { Mic } from "lucide-react";
import { Card, ICONS, timeAgo } from "@/components/Card";
import { Badge, type Tone } from "@/components/ui/badge";

export type ConversationItem = {
  id: string;
  startedAt: string;
  lastActiveAt: string;
  endedAt: string | null;
  usedVoice: boolean;
  summary: string | null;
  mood: string | null;
  concerns: string[];
  messages: { id: string; role: string; content: string; viaVoice: boolean; createdAt: string }[];
};

const MOOD: Record<string, { label: string; tone: Tone }> = {
  good: { label: "Seemed good", tone: "good" },
  okay: { label: "Seemed okay", tone: "neutral" },
  low: { label: "Seemed low", tone: "warn" },
  unwell: { label: "Unwell", tone: "bad" },
};

function minutesBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

// What the senior talked about with the companion, summarised for the family.
export function ConversationsCard({ conversations, elderName, title = "Conversations with the companion" }: { conversations: ConversationItem[]; elderName: string; title?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const first = elderName.split(" ")[0];

  return (
    <Card title={title} icon={ICONS.chat}>
      {conversations.length === 0 && (
        <p className="text-sm text-stone-500">
          When {first} talks to the companion (by voice or typing), a short summary of each conversation appears here.
        </p>
      )}
      <ul className="space-y-3">
        {conversations.map((c) => {
          const mood = c.mood ? MOOD[c.mood] ?? MOOD.okay : null;
          const userTurns = c.messages.filter((m) => m.role === "user").length;
          return (
            <li key={c.id} className="rounded-xl border border-line px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span className="font-medium text-stone-700">
                  {new Date(c.startedAt).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })}
                </span>
                <span>· {minutesBetween(c.startedAt, c.lastActiveAt)} min · {userTurns} message{userTurns === 1 ? "" : "s"}</span>
                {c.usedVoice && (
                  <Badge tone="accent" icon={Mic}>
                    Voice
                  </Badge>
                )}
                {mood && <Badge tone={mood.tone}>{mood.label}</Badge>}
                {!c.endedAt && <span className="text-emerald-600">● talking now</span>}
              </div>

              <p className="mt-1.5 text-sm text-stone-700">
                {c.summary ?? (c.endedAt ? "No summary available." : "Summary will appear when the conversation ends.")}
              </p>

              {c.concerns.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.concerns.map((concern) => (
                    <Badge key={concern} tone="warn">
                      {concern}
                    </Badge>
                  ))}
                </div>
              )}

              <button
                onClick={() => setOpen(open === c.id ? null : c.id)}
                className="mt-2 text-xs font-medium text-stone-400 hover:text-accent"
              >
                {open === c.id ? "Hide transcript" : "Show transcript"}
              </button>
              {open === c.id && (
                <div className="mt-2 space-y-1.5 rounded-lg bg-stone-50 p-3">
                  {c.messages.map((m) => (
                    <p key={m.id} className="text-sm">
                      <span className={`font-medium ${m.role === "user" ? "text-stone-800" : "text-accent-hover"}`}>
                        {m.role === "user" ? first : "Companion"}
                        {m.viaVoice && m.role === "user" ? " 🎙" : ""}:
                      </span>{" "}
                      <span className="text-stone-600">{m.content}</span>
                      <span className="ml-1.5 text-[10px] text-stone-400">{timeAgo(m.createdAt)}</span>
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
