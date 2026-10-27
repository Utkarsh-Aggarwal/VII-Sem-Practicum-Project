/* Smart-home hub simulator — stands in for the ESP32 hub until the firmware is ready.
 *
 * Talks to the backend over exactly the HTTP contract in docs/API_CONTRACT.md, so anything that
 * works here will work with the real hub:
 *   - pairs with a 6-digit code (or reuses a token)
 *   - posts telemetry every 15 s (PIR motion, temperature, humidity, sound level)
 *   - polls /api/hub/state for due reminders and "speaks" them
 *   - lets you type replies like the senior would speak them
 *
 * Usage:
 *   npm run hub:sim -- --code 123456
 *   npm run hub:sim -- --token ccd_demo-hub-token-for-local-testing-only
 *   options: --server http://localhost:3000   --auto-answer yes|no   --interval 15
 *
 * While running, type:
 *   anything      -> sent as a voice transcript (reminder answer or companion chat)
 *   /yes /no      -> big-button answer to the open reminder
 *   /help         -> help button          /talk  -> talk button
 *   /quiet        -> stop reporting motion (simulates nobody moving)     /active -> resume
 *   /quit
 */
import readline from "node:readline";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]);
    return acc;
  }, [])
);

const SERVER = (args.server || process.env.CARECIRCLE_SERVER || "http://localhost:3000").replace(/\/$/, "");
const INTERVAL = Number(args.interval || 15) * 1000;
let token: string = args.token || "";
let quiet = false;
let lastSpokenCheckIn: string | null = null;

const c = { dim: "\x1b[2m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", reset: "\x1b[0m" };
const log = (msg: string) => console.log(`${c.dim}${new Date().toLocaleTimeString()}${c.reset} ${msg}`);
const speak = (text: string) => log(`${c.cyan}🔊 HUB SAYS:${c.reset} ${text}`);

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SERVER}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body.error ?? res.statusText}`);
  return body;
}

async function pair() {
  if (token) return;
  if (!args.code) {
    console.error("Pass --code <6-digit pairing code> (shown on the dashboard) or --token <device token>.");
    process.exit(1);
  }
  const data = await api("/api/devices/pair", {
    method: "POST",
    body: JSON.stringify({ code: args.code, kind: "HUB", name: "Simulated hub" }),
  });
  token = data.token;
  log(`Paired with ${data.elder.name}. Device token (save it): ${token}`);
}

async function sendTelemetry() {
  const hour = new Date().getHours();
  const awake = hour >= 6 && hour < 23;
  const motion = quiet || !awake ? 0 : Math.round(Math.random() * 5);
  const payload = {
    motion,
    temperature: Math.round((26 + Math.sin(((hour - 9) / 24) * 2 * Math.PI) * 4 + Math.random()) * 10) / 10,
    humidity: Math.round(50 + Math.random() * 12),
    sound_level: Math.round(awake && !quiet ? 38 + Math.random() * 12 : 28 + Math.random() * 3),
  };
  await api("/api/hub/telemetry", { method: "POST", body: JSON.stringify(payload) });
  log(`${c.dim}telemetry ${JSON.stringify(payload)}${c.reset}`);
}

async function pollState() {
  const state = await api("/api/hub/state");
  const r = state.pendingReminder;
  if (r && r.checkInId !== lastSpokenCheckIn) {
    lastSpokenCheckIn = r.checkInId;
    log(`${c.yellow}⏰ Reminder: ${r.label}${c.reset}`);
    speak(r.speak);
    if (args["auto-answer"] === "yes" || args["auto-answer"] === "no") {
      setTimeout(() => reply({ answer: args["auto-answer"], checkInId: r.checkInId }), 3000);
    }
  }
}

async function reply(body: Record<string, string>) {
  const { say } = await api("/api/hub/reply", { method: "POST", body: JSON.stringify(body) });
  if (say?.text) speak(say.text);
}

async function event(type: string) {
  const { say } = await api("/api/hub/event", { method: "POST", body: JSON.stringify({ type }) });
  if (say?.text) speak(say.text);
}

const safe = (fn: () => Promise<unknown>) => () => fn().catch((e) => log(`${c.red}${(e as Error).message}${c.reset}`));

async function main() {
  await pair();
  await event("boot");
  log(`Simulated hub running against ${SERVER}. Type to talk; /help /talk /yes /no /quiet /active /quit`);

  safe(sendTelemetry)();
  safe(pollState)();
  setInterval(safe(sendTelemetry), INTERVAL);
  setInterval(safe(pollState), 10_000);

  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const text = line.trim();
    if (!text) return;
    const run = (fn: () => Promise<unknown>) => safe(fn)();
    switch (text) {
      case "/quit":
        process.exit(0);
      case "/help":
        return run(() => event("help_button"));
      case "/talk":
        return run(() => event("talk_button"));
      case "/yes":
      case "/no":
        return run(() => reply({ answer: text.slice(1), ...(lastSpokenCheckIn ? { checkInId: lastSpokenCheckIn } : {}) }));
      case "/quiet":
        quiet = true;
        return log("Motion reporting paused (nobody moving).");
      case "/active":
        quiet = false;
        return log("Motion reporting resumed.");
      default:
        return run(() => reply({ text }));
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
