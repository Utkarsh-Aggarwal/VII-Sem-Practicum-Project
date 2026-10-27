# Local setup guide

How to get CareCircle running on your own machine: the backend and caregiver dashboard, the hub simulator, and the mobile app on a real phone. For what the project does, see [README.md](README.md).

## What you need

| Tool | Version | Used for |
|---|---|---|
| [Node.js](https://nodejs.org/) | 20 or newer (tested on 22) | backend, dashboard, hub simulator, Metro bundler |
| npm | comes with Node | installing dependencies |
| A phone with **Expo Go** ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)) | latest | running the mobile app |
| Git | any | cloning the repo |

Optional:
- API keys for the AI features (see [step 2](#2-configure-the-environment)). Everything works without them using built-in offline replies, except voice input.
- Xcode (iOS Simulator) or Android Studio (emulator) if you want to run the app without a phone.
- An MQTT broker (e.g. Mosquitto) and the ESP32-CAM, only for real hardware.

## 1. Clone and install

```bash
git clone https://github.com/Utkarsh-Aggarwal/VII-Sem-Practicum-Project.git
cd VII-Sem-Practicum-Project

cd apps/web && npm install
cd ../mobile && npm install
cd ../..
```

## 2. Configure the environment

All configuration lives in `apps/web/.env`, which is gitignored. Create it from the template:

```bash
cd apps/web
cp .env.example .env
openssl rand -hex 32        # paste the output into AUTH_SECRET in .env
```

Then fill in the keys you have:

| Variable | Needed for | Where to get it |
|---|---|---|
| `AUTH_SECRET` | **Required.** Signs caregiver sessions | `openssl rand -hex 32` |
| `GROQ_API_KEY` | AI companion replies **and** speech-to-text (Whisper) | [console.groq.com/keys](https://console.groq.com/keys) (free tier) |
| `GEMINI_API_KEY` | Alternative LLM for the companion | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `ELEVENLABS_API_KEY` | Best speech-to-text for Hindi, plus a natural spoken voice for Saathi | [elevenlabs.io](https://elevenlabs.io/app/settings/api-keys). Give the key **Speech to Text** and **Text to Speech** access (add **Voices: read** if you want it to pick a voice automatically) |
| `MQTT_URL` | Only for a real hub over MQTT | your broker, e.g. `mqtt://localhost:1883` |

**For the voice agent (hold-to-talk) you need at least one of `GROQ_API_KEY` or `ELEVENLABS_API_KEY`.** Without either, the server answers voice requests with *"Voice isn't set up on the server yet"*. Without ElevenLabs, replies are spoken by the phone's built-in voice.

## 3. Create the database and demo data

```bash
cd apps/web
npx prisma db push      # creates prisma/dev.db (SQLite) from prisma/schema.prisma
npm run db:seed         # demo family with 3 weeks of history (re-run any time to reset)
```

The seed prints the demo logins and codes:

| What | Value |
|---|---|
| Caregiver login | `mann42006@gmail.com` / `carecircle123` |
| Sibling caregiver | `rohan@example.com` / `carecircle123` |
| Senior app pairing code | `123456` (Rameshbhai Shah), `654321` (Kamlaben Shah) |
| Demo hub token | `ccd_demo-hub-token-for-local-testing-only` |

Re-run `npm run db:seed` right before a demo: the storyline ("today his first activity is at 10:30, usually 06:45") is built relative to *today*.

## 4. Start the backend and dashboard

```bash
cd apps/web
npm run dev
```

- Dashboard: <http://localhost:3000>. Sign in with the caregiver login above.
- The terminal should print `[scheduler] running every 30s`. That's the reminder scheduler.
- Next.js listens on all network interfaces, so the phone can reach it at `http://<your-computer's-IP>:3000`.

Leave this terminal running.

## 5. Simulate the smart-home hub (optional, no hardware)

In a second terminal:

```bash
cd apps/web
npm run hub:sim -- --token ccd_demo-hub-token-for-local-testing-only
# or pair a fresh simulated hub with a code from the dashboard:
npm run hub:sim -- --code 123456
```

It streams motion/temperature/humidity telemetry and "speaks" reminders when they come due. Type a message to talk to the companion. `/yes`, `/no`, `/help` and `/talk` act like the hub's buttons.

## 6. Run the mobile app on your phone

1. **Put your computer and phone on the same Wi-Fi network.** Hotspots work too, as long as both are on the same one. Some campus or office networks block device-to-device traffic. If the phone can't connect, use a phone hotspot.
2. Find your computer's LAN IP:
   ```bash
   ipconfig getifaddr en0          # macOS (try en1 if empty)
   hostname -I                     # Linux
   ipconfig                        # Windows: look for "IPv4 Address"
   ```
3. Start Expo (third terminal):
   ```bash
   cd apps/mobile
   npx expo start --lan
   ```
   If Expo picks the wrong address, force it: `REACT_NATIVE_PACKAGER_HOSTNAME=<your-ip> npx expo start --lan`.
4. Scan the QR code with the iPhone camera, or from inside Expo Go on Android. Or open Expo Go → "Enter URL manually" → `exp://<your-ip>:8081`.
5. In the app, set **Server address** to `http://<your-ip>:3000`, **not** `localhost`. On the phone, `localhost` means the phone itself.
6. Choose a mode:
   - **"This is my phone"** (senior mode): enter pairing code `123456` (English) or `654321` (Hindi).
   - **"I look after someone"** (caregiver mode): sign in with the caregiver login.
7. Allow microphone access when asked. Hold-to-talk needs it.

**Simulators:** with Xcode or Android Studio installed, press `i` (iOS Simulator) or `a` (Android emulator) in the Expo terminal. The iOS Simulator can use `http://localhost:3000`. The Android emulator uses `http://10.0.2.2:3000`.

**Expo Go limits:** remote push notifications and scheduled local reminder pop-ups need a development build (`npx expo run:android` / `npx expo run:ios`). In Expo Go the app still polls the server and shows reminders and alerts live.

## 7. Check that everything works

Run these from `apps/web` with the server running:

```bash
# Server is up (expect 307, a redirect to /login)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/

# Voice pipeline end to end: record a clip, upload it, get transcript + reply + audio
say -o /tmp/clip.m4a --data-format=aac "Hello Saathi, I took my medicine"   # macOS; on other OSes record any short .m4a/.wav
curl -s -H "Authorization: Bearer ccd_demo-hub-token-for-local-testing-only" \
     -F "audio=@/tmp/clip.m4a;type=audio/m4a" http://localhost:3000/api/mobile/voice
```

A working voice setup returns JSON with `transcript`, `reply` and an `audioUrl`.

Unit tests and lint:

```bash
cd apps/web
npm test
npm run lint
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| App says *"Can't reach the server"* | Server address is `localhost` or the wrong IP, or the devices are on different networks. Use `http://<computer-IP>:3000` and open that URL in the phone's browser to test. Check your firewall allows incoming connections to Node. |
| Voice: *"Voice isn't set up on the server yet"* (HTTP 503) | No working speech-to-text. Set `GROQ_API_KEY` or `ELEVENLABS_API_KEY` in `apps/web/.env` and **restart** `npm run dev`. If keys are set, check the server log: `[stt] failed: fetch failed` means the computer had no internet when the request ran. Restart the dev server after switching networks. |
| Voice: `401 ... missing the permission` in the server log | The ElevenLabs key is restricted. Enable Speech to Text and Text to Speech for it, or remove `ELEVENLABS_API_KEY` to fall back to Groq Whisper. A `voices_read` warning alone is harmless (a default voice is used). |
| Saathi replies in Hindi when you speak English (or vice versa) | The parent's language setting decides the reply language. Change it in the app's settings or on the parent's Settings page in the dashboard. Re-seeding resets it. |
| Microphone does nothing | Microphone permission was denied. Enable it for Expo Go in the phone's settings and reopen the app. |
| Expo QR code doesn't open, or loads forever | Phone can't reach port 8081. Same-network check as above, or try `npx expo start --tunnel`. |
| Demo storyline looks stale | Run `npm run db:seed` again. |
| Port 3000 or 8081 already in use | Stop the old process: `lsof -ti:3000 \| xargs kill` (or `:8081`). |

## Real hardware (optional)

- **ESP32-CAM live feed:** see [firmware/esp32-cam/README.md](firmware/esp32-cam/README.md).
- **Hub:** set `MQTT_URL` (and credentials) in `.env`. The backend bridges `carecircle/v1/hub/{deviceId}/...` topics. The message contract is in [docs/API_CONTRACT.md](docs/API_CONTRACT.md).
