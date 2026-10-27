"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, ChevronLeft, Copy, Moon, Pill, Smartphone, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatTime12 } from "@/lib/format";

const COLORS = ["#0F766E", "#C2410C", "#7C3AED", "#2563EB", "#BE185D"];
const RELATIONS = ["Mother", "Father", "Grandmother", "Grandfather", "Mother-in-law", "Father-in-law", "Relative"];

const PRESETS = [
  { key: "morning-med", icon: Pill, type: "MEDICINE", label: "Morning medicine", time: "08:00", question: "Did you take your morning medicine?" },
  { key: "lunch", icon: Utensils, type: "MEAL", label: "Lunch", time: "13:00", question: "Have you had your lunch?" },
  { key: "evening-med", icon: Pill, type: "MEDICINE", label: "Evening medicine", time: "20:00", question: "Did you take your evening medicine?" },
  { key: "bed", icon: Moon, type: "SLEEP", label: "Bedtime", time: "22:00", question: "Are you getting ready for bed?" },
] as const;

const STEPS = ["About them", "Reminders", "Connect phone"];

// Guided setup: who they are -> first reminders -> pair their phone.
export default function NewElderPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [elder, setElder] = useState<{ id: string; name: string } | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("Mother");
  const [language, setLanguage] = useState("hi");
  const [color, setColor] = useState(COLORS[0]);
  const [picked, setPicked] = useState<string[]>(["morning-med"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const first = (elder?.name ?? name).split(" ")[0] || "them";

  async function createElder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/elders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone: phone || undefined, avatarColor: color, relation, language }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Something went wrong. Please try again.");
    const { elder: created } = await res.json();
    setElder(created);
    setCode(created.pairingCode);
    setStep(1);
  }

  async function addReminders() {
    if (!elder) return;
    setBusy(true);
    for (const p of PRESETS.filter((x) => picked.includes(x.key))) {
      await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elderId: elder.id, type: p.type, label: p.label, time: p.time, question: p.question }),
      });
    }
    setBusy(false);
    if (picked.length) toast(`${picked.length} reminder${picked.length === 1 ? "" : "s"} added`);
    setStep(2);
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-accent">
        <ChevronLeft className="h-4 w-4" />
        Family
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Add a parent</h1>

      <ol className="mt-5 mb-6 grid grid-cols-3 gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label}>
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-surface-2"}`} />
            <p className={`mt-1.5 text-xs font-medium ${i === step ? "text-accent" : "text-muted"}`}>
              {i + 1}. {label}
            </p>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-line bg-surface p-6">
        {step === 0 && (
          <form onSubmit={createElder} className="space-y-5">
            <Field label="Their name" htmlFor="name">
              <input id="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Rameshbhai Shah" autoFocus />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="They are your" htmlFor="relation">
                <select id="relation" value={relation} onChange={(e) => setRelation(e.target.value)} className={inputClass}>
                  {RELATIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Phone (optional)" htmlFor="phone" hint="Adds a Call button.">
                <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="+91 …" />
              </Field>
            </div>
            <div>
              <p className="text-sm font-medium">Language they speak</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["hi", "हिंदी", "Hindi"],
                    ["en", "English", "English"],
                  ] as const
                ).map(([value, label, sub]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLanguage(value)}
                    aria-pressed={language === value}
                    className={`rounded-xl border-2 px-4 py-3 text-left transition ${language === value ? "border-accent bg-accent-soft" : "border-line hover:border-stone-300"}`}
                  >
                    <span className="block text-lg font-semibold">{label}</span>
                    <span className="text-xs text-muted">{sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Colour</p>
              <div className="mt-2 flex gap-2.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-offset-2 transition ${color === c ? "ring-ink" : "ring-transparent"}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Colour ${c}`}
                  >
                    {color === c && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold">What should we remind {first} about?</h2>
            <p className="mt-1 text-sm text-muted">Pick a few to start. You can change times and add more later.</p>
            <div className="mt-4 space-y-2">
              {PRESETS.map((p) => {
                const on = picked.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((cur) => (on ? cur.filter((k) => k !== p.key) : [...cur, p.key]))}
                    className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${on ? "border-accent bg-accent-soft" : "border-line hover:border-stone-300"}`}
                  >
                    <p.icon className="h-5 w-5 text-accent" />
                    <span className="flex-1 font-medium">{p.label}</span>
                    <span className="text-sm text-muted">{formatTime12(p.time)}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${on ? "border-accent bg-accent text-white" : "border-line"}`}>
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Skip
              </Button>
              <Button className="flex-1" size="lg" loading={busy} onClick={addReminders}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && elder && (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Smartphone className="h-6 w-6" />
            </div>
            <h2 className="mt-3 text-lg font-semibold">Connect {first}&apos;s phone</h2>
            <p className="mt-1 text-sm text-muted">Open CareCircle on their phone, choose the language, tap “Patient”, and enter:</p>
            <p className="mt-4 font-mono text-4xl font-semibold tracking-[0.3em]">{code}</p>
            <Button
              variant="ghost"
              size="sm"
              icon={Copy}
              className="mt-2"
              onClick={() => {
                if (code) navigator.clipboard?.writeText(code);
                toast("Code copied");
              }}
            >
              Copy code
            </Button>
            <p className="mt-4 text-xs text-muted">You can always find this code later in {first}&apos;s Settings tab.</p>
            <Button size="lg" className="mt-6 w-full" onClick={() => router.push(`/elders/${elder.id}`)}>
              Go to {first}&apos;s page <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
