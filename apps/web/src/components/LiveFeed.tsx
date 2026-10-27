"use client";

import { useState } from "react";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft";

const CAMERA_ICON = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M15 10l4.55-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.45.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
  />
);

export function LiveFeed({
  elderId,
  elderName,
  cameraUrl,
}: {
  elderId: string;
  elderName: string;
  cameraUrl: string | null;
}) {
  const [url, setUrl] = useState(cameraUrl);
  const [editing, setEditing] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [nonce, setNonce] = useState(0);

  async function save(newUrl: string) {
    const trimmed = newUrl.trim().replace(/\/$/, "");
    const res = await fetch(`/api/elders/${elderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraUrl: trimmed || null }),
    });
    if (res.ok) {
      setUrl(trimmed || null);
      setStreamError(false);
      setEditing(false);
    }
  }

  function retry() {
    setStreamError(false);
    setNonce((n) => n + 1);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-medium text-stone-900">
          <svg className="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            {CAMERA_ICON}
          </svg>
          Live feed
        </h2>
        <div className="flex items-center gap-2">
          {url && !streamError && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          )}
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-xs font-medium text-stone-400 transition hover:text-accent"
          >
            {url ? "Change camera" : "Add camera"}
          </button>
        </div>
      </div>

      {editing && (
        <CameraUrlForm
          initialUrl={url ?? ""}
          onCancel={() => setEditing(false)}
          onSave={save}
        />
      )}

      <div className="relative flex aspect-video items-center justify-center bg-linear-to-br from-stone-800 via-stone-900 to-stone-950">
        {url && !streamError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={nonce}
            src={`${url}/stream`}
            alt={`${elderName}'s home camera`}
            className="h-full w-full object-contain"
            onError={() => setStreamError(true)}
          />
        ) : (
          <>
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
            <div className="relative text-center text-stone-400">
              <svg className="mx-auto mb-2 h-10 w-10 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                {CAMERA_ICON}
              </svg>
              {url && streamError ? (
                <>
                  <p className="text-sm font-medium text-stone-300">Can&apos;t reach the camera</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Check that {elderName}&apos;s ESP32-CAM is powered on and on the same network
                  </p>
                  <button
                    onClick={retry}
                    className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:bg-white/20"
                  >
                    Retry
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-stone-300">No camera connected</p>
                  <p className="mt-0.5 text-xs text-stone-500">{elderName}&apos;s home camera will appear here</p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CameraUrlForm({
  initialUrl,
  onSave,
  onCancel,
}: {
  initialUrl: string;
  onSave: (url: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialUrl);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(value);
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 border-b border-stone-100 bg-stone-50/70 px-5 py-3.5"
    >
      <div className="min-w-[220px] flex-1">
        <label className="block text-xs font-medium text-stone-600">ESP32-CAM address</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="http://192.168.1.50"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-stone-400">
          The IP printed in the Arduino serial monitor after it connects to WiFi. Must be reachable from this browser
          (same LAN, unless port-forwarded).
        </p>
      </div>
      <div className="flex gap-2 pb-0.5">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3.5 py-2 text-sm font-medium text-stone-500 transition hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
