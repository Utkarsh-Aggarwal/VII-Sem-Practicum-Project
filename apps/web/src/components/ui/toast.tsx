"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CircleCheck, CircleAlert, X } from "lucide-react";

type Toast = { id: number; message: string; tone: "good" | "bad" };

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

// Small confirmation after every save ("Reminder added"), so actions never feel silent.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: Toast["tone"] = "good") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg"
            style={{ animation: "toast-in 160ms ease-out" }}
          >
            {t.tone === "good" ? <CircleCheck className="h-4 w-4 text-emerald-300" /> : <CircleAlert className="h-4 w-4 text-red-300" />}
            {t.message}
            <button onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="ml-1 text-white/60 hover:text-white" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
