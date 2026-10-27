"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, ICONS, inputClass, primaryButton } from "@/components/Card";
import { useToast } from "@/components/ui/toast";

type Elder = { id: string; name: string; language: string; timezone: string; profile: string | null };

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

// What the AI companion knows about the senior, and which language it speaks.
export function ProfileSettings({ elder }: { elder: Elder }) {
  const router = useRouter();
  const toast = useToast();
  const [language, setLanguage] = useState(elder.language);
  const [timezone, setTimezone] = useState(elder.timezone);
  const [profile, setProfile] = useState(elder.profile ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/elders/${elder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, timezone, profile }),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      toast("Profile saved");
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    }
  }

  const zones = TIMEZONES.includes(elder.timezone) ? TIMEZONES : [elder.timezone, ...TIMEZONES];

  return (
    <Card title="Companion & profile" icon={ICONS.settings}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600">Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600">Timezone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600">About {elder.name.split(" ")[0]} (the companion uses this)</label>
          <textarea
            rows={4}
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            maxLength={2000}
            placeholder="Interests, family names, routine, things that cheer them up. e.g. Loves old Hindi songs and cricket. Grandson Aarav is 6. Walks in the park every morning."
            className={inputClass}
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-xs text-[var(--success)]">Saved ✓</span>}
          <button disabled={busy} className={primaryButton}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Card>
  );
}
