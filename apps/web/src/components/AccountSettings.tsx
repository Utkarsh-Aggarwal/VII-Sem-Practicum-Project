"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, UserRound } from "lucide-react";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function AccountSettings({ name: initialName, email }: { name: string; email: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"name" | "password" | null>(null);

  async function save(body: object, kind: "name" | "password") {
    setBusy(kind);
    const res = await fetch("/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    if (!res.ok) return toast((await res.json().catch(() => ({}))).error ?? "Couldn't save", "bad");
    toast(kind === "name" ? "Name saved" : "Password changed");
    if (kind === "password") {
      setCurrent("");
      setNext("");
    }
    router.refresh();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card title="Your profile" icon={UserRound}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save({ name }, "name");
          }}
          className="space-y-4"
        >
          <Field label="Name" htmlFor="name">
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
          </Field>
          <Field label="Email" htmlFor="email" hint="Siblings use this email to share a parent with you.">
            <input id="email" value={email} disabled className={`${inputClass} bg-surface-2 text-muted`} />
          </Field>
          <Button type="submit" loading={busy === "name"} disabled={name.trim() === initialName}>
            Save
          </Button>
        </form>
      </Card>

      <Card title="Change password" icon={KeyRound}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save({ currentPassword: current, newPassword: next }, "password");
          }}
          className="space-y-4"
        >
          <Field label="Current password" htmlFor="current">
            <input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required className={inputClass} />
          </Field>
          <Field label="New password" htmlFor="new" hint="At least 8 characters.">
            <input id="new" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required className={inputClass} />
          </Field>
          <Button type="submit" loading={busy === "password"}>
            Change password
          </Button>
        </form>
      </Card>

      <Button variant="secondary" icon={LogOut} onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
