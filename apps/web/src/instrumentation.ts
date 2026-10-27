// Runs once when the Next.js server starts: boots the reminder scheduler and the (optional) MQTT
// bridge to the smart-home hub. Node runtime only; skipped while `next build` collects pages.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const [{ startScheduler }, { startMqttBridge }] = await Promise.all([
    import("./lib/scheduler"),
    import("./lib/mqtt"),
  ]);
  startScheduler();
  await startMqttBridge().catch((err) => console.warn("[mqtt] bridge failed to start:", err));
}
