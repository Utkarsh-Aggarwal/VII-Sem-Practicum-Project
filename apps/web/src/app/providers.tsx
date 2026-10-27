"use client";

import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/dialog";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
