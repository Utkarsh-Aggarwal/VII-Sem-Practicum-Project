# CareCircle — Ambient Care Companion

An elder-care system built around three pillars (from the GUARDIAN project, see `Ambient-Care-Companion-Project-Plan.pdf`):
**reminders**, **monitoring** and **companionship**, delivered through a smart-home hub and two app experiences.

- **`apps/web`** — Next.js caregiver dashboard **and the backend**: API routes, Prisma + SQLite, the reminder scheduler, the MQTT bridge to the hub, and the AI services.
- **`apps/mobile`** — Expo (React Native) app with two modes:
  - **Senior mode:** lVarge text, Yes/Not-yet reminder cards, mood and wellbeing prompts, an AI companion chat that reads replies aloud, and a big help button.
  - **Caregiver mode:** today's status per parent, alerts with "I'm on it", and push notifications.
- **`firmware/esp32-cam`** — ESP32-CAM live feed (MJPEG at `/stream`) plus the door-status LED. The hub firmware is a work in progress; it talks to the backend over the contract in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

## What's implemented

### Reminders (end to end)
- Caregivers set medicine/meal/sleep/wake/custom reminders with a time and the days of the week they repeat.
- A backend scheduler (`src/lib/scheduler.ts`, started from `src/instrumentation.ts`) handles each reminder in the parent's own timezone:
  - **At the scheduled time** it sends the reminder to the hub over MQTT (`carecircle/v1/hub/{id}/reminder`, or the hub picks it up via the HTTP polling fallback) and pushes it to the senior app.
  - **15 minutes later**, if there's no answer, it sends one gentle nudge.
  - **60 minutes later**, it marks the check-in **MISSED** and alerts caregivers. A second miss in a row is escalated to *critical*.
- Answers can come from an app tap, a hub button, or voice/chat ("haan, le li" counts). A "yes" within 30 minutes is *on time*, later is *late*, and streaks get a compliment.

### Monitoring
- **Hub telemetry:** motion, temperature, humidity, sound and air quality. The dashboard shows "active since 10:30" and movement by hour.
- **Alerts:** hub offline, and no movement for 4+ hours during the day.
- **Wellbeing self-reports:** short prompts in the app (sleep, meals, walk, social), plus self-reports extracted automatically from companion conversations.
- **Routine-deviation detection** (`src/lib/ai/routine.ts`):
  - Each day becomes a feature vector: first activity time, movement, reminder adherence, meals, wellbeing, interactions.
  - The vector is compared against the parent's *own* 28-day baseline with a robust z-score (median/MAD), and every flag comes with a plain-language explanation ("First activity at 10:30, usually around 06:45").
  - Checks run in two places: a live "no activity yet this morning" check, and an end-of-day check at 20:00.
- **Alerts feed and live updates:** caregivers can mark alerts "I'm on it", which siblings see. The dashboard updates over Server-Sent Events, with browser notifications for critical alerts and Expo push to caregiver phones.

### Companionship (AI)
- **Companion "Saathi"** (`src/lib/ai/companion.ts`). It uses an LLM (Groq, Gemini, or any OpenAI-compatible endpoint) grounded in:
  - the parent's profile notes, written by the family
  - today's reminders and recent self-reports
  - indoor temperature from the hub

  Replies follow GUARDIAN's guidelines: at most 2 short sentences, varied (near-repeats are rejected), ending on a positive note, never inventing facts or giving medical advice. They're spoken aloud on the hub and in the app.
- **Safety comes first and is deterministic:**
  - Distress ("I fell", "chest pain", "सीने में दर्द") or a help request raises a critical alert and gets a fixed, calm reply. This never depends on the LLM.
  - Pain, dizziness or loneliness raise a wellbeing alert.
- **Bilingual:** English and Hindi (Devanagari and Hinglish), for the NLU, reminders, the companion and the senior app UI.
- **Works offline:** without an API key the companion uses a varied built-in phrase bank, so demos never break.
- **Encouragement:** compliments after positive self-reports and reminder streaks.

### Core platform
- **Caregiver auth:** scrypt-hashed passwords and signed session cookies (Bearer tokens on mobile). Every API checks that the caregiver is linked to that parent.
- **Linking:** multiple caregivers per parent ("share with a sibling"), with a shared notes thread.
- **Device pairing:** the senior app and the hub pair with a 6-digit code from the dashboard and get a revocable device token.
- **Push notifications:** Expo push, which delivers via FCM/APNs. The senior app falls back to local daily notifications when push isn't available (e.g. Expo Go).

## Running it

> **Full step-by-step guide (prerequisites, API keys, phone setup, voice checks, troubleshooting): [SETUP.md](SETUP.md).**

### 1. Backend + caregiver dashboard

```bash
cd apps/web
npm install
cp .env.example .env      # set AUTH_SECRET; optionally GROQ_API_KEY / GEMINI_API_KEY, MQTT_URL
npx prisma db push        # creates prisma/dev.db from prisma/schema.prisma
npm run db:seed           # demo family with 3 weeks of history
npm run dev
```

Open http://localhost:3000 and sign in as **`mann42006@gmail.com` / `carecircle123`** (a second caregiver, `rohan@example.com`, uses the same password).

The seeded storyline: Rameshbhai normally starts his day around 06:45, but **today his first activity is at 10:30**. The routine detector flags this on his page, and the scheduler raises alerts for anything due today that goes unanswered.

### 2. Simulate the smart-home hub (no hardware needed)

```bash
cd apps/web
npm run hub:sim -- --token ccd_demo-hub-token-for-local-testing-only
#   or pair a fresh one:  npm run hub:sim -- --code 123456
```

The simulator streams telemetry and "speaks" reminders when they come due. Type to talk to the companion; `/yes`, `/no`, `/help` and `/talk` act like the hub's buttons.

### 3. Mobile app

```bash
cd apps/mobile
npm install
npx expo start
```

On first launch, choose **"This is my phone"** and enter the parent's pairing code (demo: `123456` for Rameshbhai, `654321` for Kamlaben, who uses Hindi). Choose **"I look after someone"** to sign in as a caregiver instead.

The server address must be reachable from the phone, e.g. `http://192.168.1.20:3000` (your computer's LAN IP, not `localhost`). Push notifications and local reminder pop-ups need a development build (`npx expo run:android`); Expo Go skips them.

### 4. Tests

```bash
cd apps/web
npm test        # NLU, routine detection, companion shaping, timezone maths
npm run lint
```

## Configuration

See [`apps/web/.env.example`](apps/web/.env.example). Everything AI-related is optional:

| Variable | Effect |
|---|---|
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `LLM_BASE_URL`+`LLM_MODEL` | LLM for open conversation (otherwise built-in replies) |
| `STT_BASE_URL` (or `GROQ_API_KEY`) | Whisper speech-to-text for hub voice clips (`/api/hub/voice`) |
| `TTS_BASE_URL` + `TTS_MODEL` | Server-side TTS for the hub speaker (`/api/hub/tts`) |
| `MQTT_URL` | Turns on the MQTT bridge to the hub |
| `MISSED_AFTER_MIN`, `REMIND_AGAIN_AFTER_MIN`, `NO_ACTIVITY_ALERT_HOURS` | Scheduler tuning |

The dashboard's "Companion conversations" card shows which LLM is active.

## Known limits

- The scheduler and live updates run in the Next.js server process. That's fine for one server; scaling out would need a job queue and Redis pub/sub.
- SQLite is fine for the project. Switch `DATABASE_URL`/provider to Postgres for a real deployment.
- MQTT trusts the device id in the topic. Use a private broker with per-device ACLs outside of demos (see the contract doc).
