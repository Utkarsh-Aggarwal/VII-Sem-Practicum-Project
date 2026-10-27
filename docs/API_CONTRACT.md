# Hub ↔ Backend contract

This is what the smart-home hub firmware needs to implement to plug into the CareCircle backend.
Everything here is already live on the backend. Until the hub is ready, `npm run hub:sim` in
`apps/web` (see [scripts/hub-simulator.ts](../apps/web/scripts/hub-simulator.ts)) plays the hub's
part over exactly this contract.

The existing ESP32-CAM sketch isn't affected by any of this:

- The dashboard still loads the camera's MJPEG stream straight from `{cameraUrl}/stream` in the browser.
- The `home/door/status` MQTT topic is outside the `carecircle/v1/...` namespace, so the backend never subscribes or publishes to it.

There are two transports. They share the same handlers, so you can use either one or mix them:

| | HTTP (simplest) | MQTT (lower latency, push) |
|---|---|---|
| Hub → backend | `POST /api/hub/*` | publish `carecircle/v1/hub/{deviceId}/{channel}` |
| Backend → hub | poll `GET /api/hub/state`, plus the `say` in each response | subscribe `carecircle/v1/hub/{deviceId}/+` |
| Enabled by | always on | backend env `MQTT_URL` (e.g. `mqtt://broker.hivemq.com:1883`) |

## 1. Pairing (once, during device provisioning)

The caregiver dashboard shows a 6-digit **pairing code** for each parent (Devices card).

```
POST /api/devices/pair
Content-Type: application/json

{ "code": "123456", "kind": "HUB", "name": "Living room hub" }
```

`201` →

```json
{
  "token": "ccd_…",            // store in NVS; send as  Authorization: Bearer <token>  on every request
  "deviceId": "cmv…",          // your MQTT id
  "elder": { "id": "…", "name": "Rameshbhai Shah", "language": "en", "timezone": "Asia/Kolkata", "avatarColor": "#5B8DEF" },
  "mqtt": { "url": "mqtt://…", "topicPrefix": "carecircle/v1/hub/cmv…" }   // null when the backend has no MQTT
}
```

The token is returned **only once**. If it's lost, pair again with a fresh code. Wrong codes return `404`; more than 10 wrong attempts in 10 minutes return `429`.

## 2. Telemetry (every 15–60 s)

```
POST /api/hub/telemetry            MQTT: carecircle/v1/hub/{deviceId}/telemetry
{ "motion": 3, "temperature": 27.4, "humidity": 58, "sound_level": 41, "air_quality": 120, "light": 300 }
```

All fields are optional. Send what the board has.

| field | meaning | used for |
|---|---|---|
| `motion` | PIR triggers since the last report (or `true`/`false`) | "active since 8 am", no-activity alerts, routine detection |
| `temperature` | °C (-40..85) | environment card, companion small talk |
| `humidity` | % (0..100) | environment card |
| `sound_level` | any consistent scale (dB or raw ADC) | environment card |
| `air_quality` | MQ-series raw / ppm | environment card |
| `light` | lux or raw | reserved for sleep-quality estimate |

**Send `motion: 0` when nothing moved.** The backend can only tell "nobody moving" apart from "hub is off" if reports keep arriving.

Any authenticated HTTP request, or any MQTT message, counts as a heartbeat. After 10 minutes of silence the dashboard shows the hub as offline.

## 3. Reminders (backend → hub)

At the reminder's time the backend publishes:

```
MQTT: carecircle/v1/hub/{deviceId}/reminder
{
  "checkInId": "…",
  "kind": "reminder",            // or "nudge": the one follow-up, sent 15 min later if unanswered
  "type": "MEDICINE",            // MEDICINE | MEAL | SLEEP | WAKE | CUSTOM
  "label": "Blood Pressure Tablet",
  "question": "Did you take your Blood Pressure medicine?",
  "speak": "Did you take your Blood Pressure medicine?",   // text to play via TTS
  "lang": "en",                  // "en" | "hi"
  "scheduledFor": "2026-10-23T02:30:00.000Z",
  "presence": "nearby"           // "nearby" if motion was seen in the last 15 min, else "unknown"
}
```

**Without MQTT**, poll `GET /api/hub/state` every 15–30 s. When `pendingReminder` shows up with a `checkInId` you haven't spoken yet, speak it:

```json
{
  "serverTime": "…",
  "elder": { "name": "…", "language": "en", "timezone": "Asia/Kolkata" },
  "mqtt": false,
  "pendingReminder": { "checkInId": "…", "type": "MEDICINE", "label": "…", "question": "…", "speak": "…", "scheduledFor": "…", "answered": null }
}
```

If there's still no "yes" 60 minutes after the scheduled time, the check-in is marked **MISSED** and the caregivers are alerted. Two misses in a row raise a critical alert.

## 4. Answers and conversation (hub → backend)

**Button answer** (big button / yes-no buttons):

```
POST /api/hub/reply                MQTT: carecircle/v1/hub/{deviceId}/reply
{ "checkInId": "…", "answer": "yes" }          // or "no" (= not yet)
```

**Voice, with STT on the backend (recommended):** record a push-to-talk clip (WAV, 16 kHz mono, under 4 MB) and upload it:

```
POST /api/hub/voice
Content-Type: multipart/form-data     fields: audio=<file>, checkInId=<optional>
   or
Content-Type: audio/wav               body: raw WAV bytes
```

`200` → `{ "transcript": "haan le li", "say": { "text": "Great job, Rameshbhai!", "kind": "ack", "checkInId": "…" } }`

This returns `503` when no STT provider is configured. In that case use the buttons instead.

**Voice with on-device STT / keyword spotting:** send the text instead:

```
POST /api/hub/reply   { "text": "yes I took it" }
```

The backend decides what the words mean, in English, Hinglish or Hindi:

- If a reminder is open and the reply is a short yes or not-yet, it answers that reminder.
- Distress or help phrases ("I fell", "chest pain", "bachao") raise a **critical alert** to the family. The reply is a fixed, calm reassurance; it never comes from the LLM.
- Anything else goes to the AI companion. Meal, sleep and activity mentions are logged as wellbeing self-reports.

## 5. Hub events

```
POST /api/hub/event                MQTT: carecircle/v1/hub/{deviceId}/event
{ "type": "help_button" }     // critical alert to all caregivers
{ "type": "talk_button" }     // re-asks the open reminder, otherwise greets (starts a chat)
{ "type": "presence" }        // one-off motion signal (if you don't batch it into telemetry)
{ "type": "boot" }
```

## 6. What to say (backend → hub)

Every HTTP reply/event response includes a `say` object, and the same object is also published on MQTT:

```
MQTT: carecircle/v1/hub/{deviceId}/say
{ "text": "Wonderful, thank you for letting me know!", "kind": "ack" }   // kind: reply | ack | greeting | reminder
```

Replies are kept to 1–2 short sentences, with no emojis or markdown, so they're safe to send to TTS as-is.

**TTS on the backend (optional):**

```
POST /api/hub/tts  { "text": "…" }   →  audio/wav bytes   (503 if no TTS provider is configured)
```

## 7. Connection status (MQTT only)

Set the MQTT **Last Will** to topic `carecircle/v1/hub/{deviceId}/status`, payload `offline`, retained, and publish `online` (retained) after connecting. The dashboard then shows the hub as offline straight away when it drops, instead of after 10 minutes.

## 8. Security notes

- HTTP: all `/api/hub/*` calls require `Authorization: Bearer <device token>`. Caregivers can revoke a hub from the dashboard ("Unpair").
- MQTT: the backend trusts the `{deviceId}` in the topic. A public broker is fine for demos. Real deployments should use a private broker with per-device credentials and ACLs limited to the hub's own `carecircle/v1/hub/{deviceId}/#`.

## Senior app & caregiver endpoints (for reference)

| Endpoint | Who | Purpose |
|---|---|---|
| `POST /api/auth/signup`, `/login`, `/logout`, `GET /api/auth/me` | caregiver | session cookie (web) or `token` (mobile Bearer) |
| `GET /api/caregiver/overview`, `POST /api/caregiver/push-token` | caregiver | mobile caregiver mode |
| `GET/POST /api/elders`, `GET/PATCH/DELETE /api/elders/{id}` | caregiver | parents (incl. `language`, `profile`, `timezone`, `cameraUrl`) |
| `GET/POST /api/elders/{id}/pairing` | caregiver | pairing code + devices, regenerate code |
| `POST/DELETE /api/elders/{id}/caregivers` | caregiver | share with a sibling |
| `GET /api/elders/{id}/alerts`, `PATCH /api/alerts/{id}` | caregiver | alerts, acknowledge |
| `GET /api/elders/{id}/insights` | caregiver | routine-deviation features and explanations |
| `GET /api/elders/{id}/environment` | caregiver | latest sensors, hub status, motion by hour |
| `GET/POST /api/elders/{id}/chat` | caregiver | companion log / preview reply (not saved) |
| `GET/POST /api/elders/{id}/notes`, `GET …/self-reports` | caregiver | notes thread, self-reports |
| `GET /api/events` | caregiver | Server-Sent Events live updates |
| `GET /api/mobile/today` | senior app | reminders + check-ins, wellbeing prompts, mood |
| `PATCH /api/checkins/{id}` `{ "answer": "yes" \| "no" }` | senior app | answer a reminder |
| `POST /api/mood`, `/api/mobile/self-report`, `/api/mobile/chat`, `/api/mobile/help`, `/api/mobile/push-token` | senior app | mood, prompts, companion, help button, push |
