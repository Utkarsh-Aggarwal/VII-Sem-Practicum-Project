// Expo push notifications (Expo's push service delivers via FCM on Android and APNs on iOS,
// so this covers the plan's "Firebase Cloud Messaging" requirement without a Firebase server key).

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "high";
  channelId?: string;
};

export function isExpoPushToken(token: string | null | undefined): token is string {
  return !!token && /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

export async function sendPush(messages: PushMessage[]) {
  const valid = messages.filter((m) => isExpoPushToken(m.to));
  if (!valid.length) return;
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(valid.map((m) => ({ sound: "default", priority: "high", ...m }))),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn("[push] expo responded", res.status, await res.text());
  } catch (err) {
    console.warn("[push] failed:", (err as Error).message);
  }
}
