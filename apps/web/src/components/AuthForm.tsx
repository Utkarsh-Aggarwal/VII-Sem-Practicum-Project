"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { inputClass as fieldInput } from "@/components/ui/field";

const inputClass = fieldInput;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "signup" ? { name, email, password } : { email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "login" ? "Welcome back" : "Create your family account"}
      </h1>
      <p className="mt-1 text-sm text-stone-500">
        {mode === "login"
          ? "Sign in to see how your family is doing today."
          : "You'll be able to add parents and share them with siblings."}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        {mode === "signup" && (
          <div>
            <label className="block text-sm font-medium text-stone-700" htmlFor="name">Your name</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Anita Shah" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-stone-700" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-stone-500">
        {mode === "login" ? (
          <>New here? <Link href="/signup" className="font-medium text-accent hover:underline">Create an account</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link></>
        )}
      </p>
    </div>
  );
}
