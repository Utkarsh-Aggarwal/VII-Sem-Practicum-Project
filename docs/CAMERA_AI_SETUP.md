# Camera AI setup: fall detection and face verification with the ESP32-CAM

This guide sets up the camera AI from the start. At the end:

- The ESP32-CAM streams video.
- The camera AI service (`services/vision`) watches that video. It detects a fall with YOLO pose and tells the patient apart from other people with DeepFace.
- The dashboard and the caretaker app show the same live video, with a "Camera AI: Rameshbhai · standing" badge.
- A fall raises a critical `FALL_DETECTED` alert with the siren and the "I'm on it" button.

All models are open source and run on your computer. Video and face photos never leave your computer. Only small results ("1 person, standing, patient") go to the CareCircle backend.

---

## 1. How it works

The ESP32-CAM serves its live video at `http://<camera-ip>/stream`. **It can serve only one viewer at a time.** If the dashboard opens the stream, nobody else can get it, and the reverse.

So the camera AI service is the camera's only viewer. It reads the one stream, and it does two things with each frame:

1. It sends the frame on to every viewer at `http://<computer-ip>:8100/stream/<elderId>` (the "relay"). The dashboard and the app play this.
2. Once per second it gives the newest frame to the models (YOLO pose, and DeepFace every 5 s).

```
                         one connection
  ESP32-CAM  /stream  ─────────────────▶  camera AI service (port 8100)
                                           │   │
                     YOLO pose + DeepFace ◀┘   │ relay: /stream/<elderId>
                                           │   ├──────────▶ dashboard (browser)
          events: posture, who, falls      │   └──────────▶ caretaker app (phone)
                                           ▼
                                 CareCircle backend (port 3000)
                                  alerts, siren, live badge
```

The ESP32-CAM sketch does not change. It is in `firmware/esp32-cam/esp32_cam_livefeed.ino`.

---

## 2. What you need

| Item | Notes |
|---|---|
| AI-Thinker ESP32-CAM | With the OV2640 camera that comes with it |
| USB-to-serial adapter (FTDI) or an ESP32-CAM-MB board | To flash the sketch |
| 5 V, 2 A power supply | A weak supply makes the camera reset ("brownout") |
| A computer | Runs the backend and the camera AI. 8 GB RAM or more. macOS, Linux or Windows |
| One Wi-Fi network | The camera, the computer and the phone must all be on it. A phone hotspot works |
| Node.js 20 or newer | For the backend and dashboard |
| Python **3.11** | Not 3.12 or 3.13: TensorFlow (used by DeepFace) does not support them yet |
| Arduino IDE 2 | To flash the ESP32-CAM |
| About 3 GB free disk space | Python packages and models |

---

## 3. Flash the ESP32-CAM

1. Open Arduino IDE. Go to **File → Preferences**. In **Additional boards manager URLs**, add:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
2. Go to **Tools → Board → Boards Manager**. Install **esp32 by Espressif Systems**.
3. Go to **Tools → Manage Libraries**. Install **PubSubClient** by Nick O'Leary.
4. Open `firmware/esp32-cam/esp32_cam_livefeed.ino`.
5. Set your Wi-Fi name and password at the top of the sketch:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_NAME";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   ```
   **Caution:** do not commit your real password. The repository is public.
6. Select **Tools → Board → esp32 → AI Thinker ESP32-CAM**.
7. Select **Tools → Partition Scheme → Huge APP (3MB No OTA/1MB SPIFFS)**.
8. Connect the board:
   - With an ESP32-CAM-MB board: put the camera on it and connect USB.
   - With an FTDI adapter: FTDI 5V → 5V, GND → GND, TX → U0R, RX → U0T. Connect **GPIO0 to GND** for flashing only.
9. Select the port under **Tools → Port**. Click **Upload**.
10. After the upload, remove the GPIO0-to-GND wire (FTDI only). Press the **RST** button.
11. Open **Tools → Serial Monitor** at **115200** baud. You see:
    ```
    WiFi Connected!
    Stream URL: http://192.168.1.50
    ```
    Write down this address. This guide calls it `<camera-ip>`.
12. Test it. Open `http://<camera-ip>/stream` in a browser on the same Wi-Fi. You see live video. **Close this browser tab after the test**, because the camera serves one viewer only.

Guide for a fixed address: the camera can get a new IP after a router restart. Reserve its IP in your router's DHCP settings, or check the Serial Monitor again.

---

## 4. Start the backend and the dashboard

1. Install and prepare the backend:
   ```bash
   cd apps/web
   npm install
   cp .env.example .env
   ```
2. Open `apps/web/.env` and set `AUTH_SECRET` to any long random text.
3. Create or update the database:
   ```bash
   npx prisma db push
   npm run db:seed        # first time only: demo family
   ```
   **Run `npx prisma db push` again after each `git pull`.** If you do not, the server fails with errors like `The column main.Elder.helpCaregiverId does not exist`, and the camera AI events fail with HTTP 500.
4. Make a shared secret for the camera AI:
   ```bash
   openssl rand -hex 16
   ```
   (No `openssl` on Windows? Use any 32 random letters and digits.)
5. Find your computer's IP address on the Wi-Fi:
   - macOS: `ipconfig getifaddr en0`
   - Linux: `hostname -I`
   - Windows: `ipconfig` (the "IPv4 Address" of the Wi-Fi adapter)

   This guide calls it `<computer-ip>`, for example `192.168.1.20`.
6. Add these two lines to `apps/web/.env`:
   ```
   VISION_TOKEN=<the secret from step 4>
   VISION_STREAM_URL=http://<computer-ip>:8100
   ```
   - `VISION_TOKEN` lets only your camera AI service send events.
   - `VISION_STREAM_URL` makes the dashboard and the app play the relay, not the camera. Use the IP, not `localhost`, so that phones can open it too.
7. Start the server:
   ```bash
   npm run dev
   ```
   Read the port it prints (`Local: http://localhost:3000`). If port 3000 is in use, Next.js picks 3001 or higher. Use that port in section 6.
8. Open the dashboard and sign in as `mann42006@gmail.com` / `carecircle123`.
9. Open a parent (for example Rameshbhai), then the **Health** tab. In the **Live feed** card, click **Add camera**. Enter `http://<camera-ip>` (no `/stream` at the end). Click **Save**.
10. Write down the parent's id from the address bar: `http://localhost:3000/elders/<elderId>/health`. You need it for face photos.

The live feed stays dark until the camera AI service runs (section 6), because the dashboard now plays the relay.

---

## 5. Install the camera AI service

1. Install Python 3.11:
   - macOS: `brew install python@3.11`
   - Windows: the 3.11 installer from python.org. Select "Add python.exe to PATH".
   - Ubuntu: `sudo apt install python3.11 python3.11-venv` (on older Ubuntu, add the `deadsnakes` PPA first)
2. Make a virtual environment and install the packages:
   ```bash
   cd services/vision
   python3.11 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```
   On Windows, use `py -3.11 -m venv .venv` and `.venv\Scripts\pip install -r requirements.txt`.
   This downloads about 2 GB and takes some minutes.
3. Check the install:
   ```bash
   .venv/bin/python -m pytest -q tests
   ```
   Expected: `5 passed`.

The YOLO pose model (`yolo11n-pose.pt`, about 6 MB) downloads on the first start. The DeepFace model (Facenet512, about 90 MB) downloads on the first face check, into `~/.deepface`.

---

## 6. Enrol the patient's face

Face verification compares each face with photos that you enrol. Without photos, the service still detects people, postures and falls. It cannot say who the person is.

1. Take 3 to 5 clear photos of the patient's face: front view, good light, one face in each photo. Photos from the ESP32-CAM itself work best, because the light and the lens are the same.
2. Put them in this folder layout (`<elderId>` is from section 4, step 10):
   ```
   services/vision/faces/<elderId>/patient/1.jpg
   services/vision/faces/<elderId>/patient/2.jpg
   services/vision/faces/<elderId>/Anita/1.jpg      <- optional: family or carers
   ```
   - The patient's folder must have the name `patient`.
   - Other folder names show on the dashboard as the person's name.
3. These photos are personal data. Git ignores them. Do not commit them.

---

## 7. Start the camera AI service

From `services/vision`:

```bash
VISION_TOKEN=<the same secret as in apps/web/.env> \
BACKEND_URL=http://localhost:3000 \
.venv/bin/uvicorn vision.app:app --host 0.0.0.0 --port 8100
```

- Use the same port as `npm run dev` printed in `BACKEND_URL`.
- `--host 0.0.0.0` lets phones on the Wi-Fi open the relay.
- On Windows (PowerShell):
  ```powershell
  $env:VISION_TOKEN="<secret>"; $env:BACKEND_URL="http://localhost:3000"
  .venv\Scripts\uvicorn vision.app:app --host 0.0.0.0 --port 8100
  ```

Correct start-up log:

```
vision.faces INFO face gallery: {'<elderId>': 3}
vision.watcher INFO watching <elderId> at http://<camera-ip>/stream
vision.watcher INFO camera <elderId> connected
httpx INFO HTTP Request: POST http://localhost:3000/api/vision/event "HTTP/1.1 200 OK"
```

The service checks the backend for camera changes every 60 s. After you add or change a camera on the dashboard, wait up to one minute.

---

## 8. Check that it works

1. **Relay:** open `http://<computer-ip>:8100/stream/<elderId>` in a browser. You see the live video. Open it in a second tab too: both play.
2. **Dashboard:** reload the parent's **Health** tab. The **Live feed** card shows the video, with a "Camera AI: …" badge on the video. The badge shows each person's posture and, for an enrolled face, the name.
3. **Caretaker app:** open the parent → **Live camera**. The app gets the relay address from the backend. The phone must be on the same Wi-Fi.
4. **Models on a photo** (no camera needed):
   ```bash
   curl -F file=@photo.jpg "http://localhost:8100/analyze?elder_id=<elderId>"
   ```
   The result lists each person with `posture` (`standing`, `sitting`, `lying`) and `identity` (`patient`, a family name, `unknown`, or `null` when no face is visible).
5. **Fall:** stand in front of the camera, in full view (head to knees). Then lie down on the floor within 3 s and stay still for 10 s. A critical "Possible fall seen by the camera" alert appears on the dashboard and in the app, with the siren. Tap **I'm on it** to stop it.

---

## 9. Settings

Set these in the environment of the camera AI service.

| Setting | Default | Effect |
|---|---|---|
| `VISION_TOKEN` | (none) | Must be the same as in `apps/web/.env`. Empty: no cameras are watched, only `/analyze` works |
| `BACKEND_URL` | `http://localhost:3000` | Address of the CareCircle backend |
| `CAMERA_PATH` | `/stream` | Path read from the camera. Keep `/stream` for the ESP32-CAM sketch |
| `CAMERA_SOURCES` | (none) | `<elderId>=<source>`: use another camera for a parent. `<elderId>=0` uses the computer's webcam (demo without the ESP32-CAM) |
| `ANALYZE_EVERY_S` | `1.0` | Seconds between two analyses |
| `FACE_EVERY_S` | `5.0` | Seconds between two face checks (they are slower) |
| `FACE_MAX_DISTANCE` | `0.30` | Face match limit. Lower is stricter. Increase to `0.35` if the patient is not recognised |
| `PERSON_CONF` | `0.5` | Minimum YOLO confidence for a person |
| `FALL_TRANSITION_S` | `3` | Upright to lying within this time counts as a fall |
| `FALL_CONFIRM_S` | `10` | The person must still lie after this time |
| `HEARTBEAT_S` | `60` | Send the observation again after this time, even with no change |

In `apps/web/.env`:

| Setting | Effect |
|---|---|
| `VISION_TOKEN` | Shared secret with the service |
| `VISION_STREAM_URL` | Address of the service as browsers and phones reach it. Empty: the dashboard and the app open the camera directly, and the camera AI cannot watch at the same time |

---

## 10. Put the camera in the right place

- Mount it 1.8 to 2.2 m high, tilted down, so that it sees the full floor area where the parent walks.
- The models need to see the person from head to knees to tell standing from lying. A person who is hidden behind a bed or a sofa cannot be checked.
- Do not point it at a window or a bright light. Back light hides the face.
- Faces are checked only when the face is turned to the camera and is big enough. At more than 3 to 4 m, face verification often gives `null`.
- Do not use the camera in the bathroom. Use the mmWave sensor there (`firmware/esp32-mmwave`).

---

## 11. Troubleshooting

| Problem | Cause and fix |
|---|---|
| Log: `VISION_TOKEN is empty: cameras are not watched` | Start the service with `VISION_TOKEN=...` |
| Log: `backend refused ...: 401` | The two `VISION_TOKEN` values are different. Copy the same value to both |
| Log: `backend refused ...: 503` | `VISION_TOKEN` is not set in `apps/web/.env`. Add it and restart `npm run dev` |
| Log: `backend refused ...: 500` and the web log shows `column ... does not exist` | Run `npx prisma db push` in `apps/web`, then restart `npm run dev` |
| Log: `backend unreachable` or the service watches no camera | `BACKEND_URL` has the wrong port. Use the port that `npm run dev` printed. Another program can use port 3000 |
| Log: `camera ... not reachable` (repeats) | Another viewer has the camera's stream: close every browser tab, app or VLC that opens `http://<camera-ip>/stream`. Then check that the camera is on, and that the IP did not change |
| Dashboard live feed is dark, "Can't reach the camera" | The service does not run, or `VISION_STREAM_URL` has the wrong IP or port. Open the relay address from section 8, step 1 in the browser to check |
| App shows no video, dashboard does | `VISION_STREAM_URL` uses `localhost`. Use `<computer-ip>`. The phone must be on the same Wi-Fi |
| Relay returns `404 no camera watched` | The parent has no camera on the dashboard, or you added it less than 60 s ago |
| Patient shows as `unknown` | Add more photos taken with the ESP32-CAM, or set `FACE_MAX_DISTANCE=0.35`. Then restart the service or run `curl -X POST localhost:8100/faces/reload` |
| Camera resets, Serial Monitor shows `Brownout detector was triggered` | Use a 5 V, 2 A supply and a short cable |
| `pip install` fails on TensorFlow | Python is not 3.11. Delete `.venv` and make it again with `python3.11` |
| Video is slow | The camera sends VGA (640×480). A weak Wi-Fi signal slows it. Move the router or the camera closer |

---

## 12. Privacy

- The video goes only from the camera to the computer that runs the service, and from there to the dashboard and the app on the same network.
- No frame is saved and no frame goes to the backend or the internet. The backend gets only postures, names and fall events.
- Face photos stay in `services/vision/faces/`, which git ignores.
- The relay has no password, the same as the camera's own stream. Use it only on a home network that you trust.
