"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarClock, Moon, Pencil, Pill, Plus, Sun, Trash2, Utensils, type LucideIcon } from "lucide-react";
import { REMINDER_TYPE_LABELS, REMINDER_TYPES, WEEKDAY_LABELS, ReminderType } from "@/lib/types";
import { formatTime12 } from "@/lib/format";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, inputClass } from "@/components/ui/field";
import { Modal, useConfirm } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Reminder = {
  id: string;
  type: string;
  label: string;
  time: string;
  question: string;
  active: boolean;
  daysOfWeek: string;
};

const DEFAULT_QUESTIONS: Record<ReminderType, string> = {
  MEDICINE: "Did you take your medicine?",
  MEAL: "Have you eaten?",
  SLEEP: "Are you getting ready for bed?",
  WAKE: "Good morning! Are you awake?",
  CUSTOM: "Just checking in — all good?",
};

const TYPE_STYLE: Record<ReminderType, { icon: LucideIcon; bg: string; text: string }> = {
  MEDICINE: { icon: Pill, bg: "bg-accent-soft", text: "text-accent" },
  MEAL: { icon: Utensils, bg: "bg-warn-soft", text: "text-warn" },
  SLEEP: { icon: Moon, bg: "bg-violet-50", text: "text-violet-700" },
  WAKE: { icon: Sun, bg: "bg-amber-50", text: "text-amber-700" },
  CUSTOM: { icon: Bell, bg: "bg-surface-2", text: "text-muted" },
};

const PRESETS: { label: string; type: ReminderType; time: string; question: string }[] = [
  { label: "Morning medicine", type: "MEDICINE", time: "08:00", question: "Did you take your morning medicine?" },
  { label: "Breakfast", type: "MEAL", time: "09:00", question: "Have you had your breakfast?" },
  { label: "Lunch", type: "MEAL", time: "13:00", question: "Have you had your lunch?" },
  { label: "Evening medicine", type: "MEDICINE", time: "20:00", question: "Did you take your evening medicine?" },
  { label: "Bedtime", type: "SLEEP", time: "22:00", question: "Are you getting ready for bed?" },
];

function daysText(days: string) {
  if (days === "1,2,3,4,5,6,7") return "Every day";
  if (days === "1,2,3,4,5") return "Weekdays";
  if (days === "6,7") return "Weekends";
  return days.split(",").map((d) => WEEKDAY_LABELS[Number(d) - 1]).join(", ");
}

export function ReminderManager({ elderId, reminders, startAdding = false }: { elderId: string; reminders: Reminder[]; startAdding?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(reminders);
  const [editing, setEditing] = useState<Reminder | "new" | null>(startAdding ? "new" : null);


  async function toggleActive(reminder: Reminder) {
    const res = await fetch(`/api/reminders/${reminder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !reminder.active }),
    });
    if (!res.ok) return toast("Couldn't update the reminder", "bad");
    const { reminder: updated } = await res.json();
    setList((l) => l.map((r) => (r.id === updated.id ? updated : r)));
    toast(updated.active ? `${updated.label} turned on` : `${updated.label} paused`);
    router.refresh();
  }

  async function remove(reminder: Reminder) {
    const ok = await confirm({ title: `Remove “${reminder.label}”?`, message: "Its past check-ins will be removed too.", confirmLabel: "Remove", danger: true });
    if (!ok) return;
    await fetch(`/api/reminders/${reminder.id}`, { method: "DELETE" });
    setList((l) => l.filter((r) => r.id !== reminder.id));
    toast("Reminder removed");
    router.refresh();
  }

  function saved(r: Reminder, isNew: boolean) {
    setList((l) => (isNew ? [...l, r] : l.map((x) => (x.id === r.id ? r : x))).sort((a, b) => a.time.localeCompare(b.time)));
    setEditing(null);
    toast(isNew ? `${r.label} added for ${formatTime12(r.time)}` : "Reminder saved");
    router.replace(`/elders/${elderId}/reminders`, { scroll: false });
    router.refresh();
  }

  return (
    <Card
      title="Reminders"
      icon={CalendarClock}
      description="Spoken aloud on their phone and hub at these times."
      action={
        <Button icon={Plus} onClick={() => setEditing("new")}>
          Add
        </Button>
      }
    >
      {list.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No reminders yet" action={<Button icon={Plus} onClick={() => setEditing("new")}>Add a reminder</Button>}>
          Start with medicine or meal times. You can use a preset.
        </EmptyState>
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {list.map((reminder) => {
            const style = TYPE_STYLE[reminder.type as ReminderType] ?? TYPE_STYLE.CUSTOM;
            const Icon = style.icon;
            return (
              <li key={reminder.id} className={`flex items-center gap-3 px-2 py-3.5 ${reminder.active ? "" : "opacity-55"}`}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.bg} ${style.text}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[15px] font-semibold">{formatTime12(reminder.time)}</span>
                    <span className="truncate font-medium">{reminder.label}</span>
                  </div>
                  <div className="truncate text-sm text-muted">
                    {daysText(reminder.daysOfWeek)} · “{reminder.question}”
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reminder.active}
                  aria-label={reminder.active ? `Pause ${reminder.label}` : `Turn on ${reminder.label}`}
                  onClick={() => toggleActive(reminder)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${reminder.active ? "bg-accent" : "bg-stone-300"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${reminder.active ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <button onClick={() => setEditing(reminder)} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label={`Edit ${reminder.label}`}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(reminder)} className="rounded-lg p-2 text-muted hover:bg-bad-soft hover:text-bad" aria-label={`Remove ${reminder.label}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add a reminder" : "Edit reminder"}>
        {editing !== null && (
          <ReminderForm
            key={editing === "new" ? "new" : editing.id}
            elderId={elderId}
            initial={editing === "new" ? null : editing}
            onSaved={saved}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </Card>
  );
}

function ReminderForm({
  elderId,
  initial,
  onSaved,
  onCancel,
}: {
  elderId: string;
  initial: Reminder | null;
  onSaved: (r: Reminder, isNew: boolean) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ReminderType>((initial?.type as ReminderType) ?? "MEDICINE");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [time, setTime] = useState(initial?.time ?? "08:00");
  const [question, setQuestion] = useState(initial?.question ?? DEFAULT_QUESTIONS.MEDICINE);
  const [days, setDays] = useState<number[]>(initial ? initial.daysOfWeek.split(",").map(Number) : [1, 2, 3, 4, 5, 6, 7]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function applyPreset(p: (typeof PRESETS)[number]) {
    setType(p.type);
    setLabel(p.label);
    setTime(p.time);
    setQuestion(p.question);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!days.length) return setError("Pick at least one day.");
    setSubmitting(true);
    setError("");
    const body = { type, label, time, question, daysOfWeek: [...days].sort().join(",") };
    const res = await fetch(initial ? `/api/reminders/${initial.id}` : "/api/reminders", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initial ? body : { ...body, elderId }),
    });
    setSubmitting(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the reminder.");
    onSaved((await res.json()).reminder, !initial);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!initial && (
        <div>
          <p className="text-sm font-medium">Quick start</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => applyPreset(p)} className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-accent hover:bg-accent-soft hover:text-accent">
                {p.label} · {formatTime12(p.time)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="r-type">
          <select
            id="r-type"
            value={type}
            onChange={(e) => {
              const t = e.target.value as ReminderType;
              if (question === DEFAULT_QUESTIONS[type]) setQuestion(DEFAULT_QUESTIONS[t]);
              setType(t);
            }}
            className={inputClass}
          >
            {REMINDER_TYPES.map((t) => (
              <option key={t} value={t}>
                {REMINDER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Time" htmlFor="r-time">
          <input id="r-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="Name" htmlFor="r-label">
        <input id="r-label" required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Blood pressure tablet" className={inputClass} />
      </Field>

      <Field label="What the app asks" htmlFor="r-question" hint="Spoken and shown with Yes / Not yet buttons.">
        <input id="r-question" required value={question} onChange={(e) => setQuestion(e.target.value)} className={inputClass} />
      </Field>

      <div>
        <p className="text-sm font-medium">Repeats on</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map((d, i) => {
            const on = days.includes(i + 1);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setDays((cur) => (on ? cur.filter((x) => x !== i + 1) : [...cur, i + 1]))}
                className={`h-9 w-11 rounded-lg text-sm font-medium transition ${on ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-ink"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {initial ? "Save" : "Add reminder"}
        </Button>
      </div>
    </form>
  );
}
