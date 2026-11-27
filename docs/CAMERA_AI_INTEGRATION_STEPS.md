# Camera AI integration: exact steps for an AI coding assistant

This file is written for an AI coding assistant. It tells you, step by step, how to add the
"one ESP32-CAM stream" integration to the CareCircle code. Follow it exactly. Do not improve it.

If you are a person who wants to set the system up (not change the code), read
[CAMERA_AI_SETUP.md](CAMERA_AI_SETUP.md) instead.

---

## PART 0. Read these rules first. Obey all of them.

1. Do the steps in the given order. Do one step at a time.
2. Change **only** the files that this document names. Do not change any other file.
3. **Never change `firmware/esp32-cam/esp32_cam_livefeed.ino`.** The camera code is fixed. The whole
   point of this work is that the camera stays as it is.
4. Each step has a **FIND** block and a **REPLACE WITH** block.
   - Search the file for the FIND text. It must match exactly, with the same spaces.
   - Replace it with the REPLACE WITH text, exactly. Do not add, remove or "fix" anything.
5. If you cannot find the FIND text:
   - First check if the REPLACE WITH text is already in the file. If yes, the step is already done. Go to the next step.
   - If no, **STOP**. Do not guess. Tell the user: "Step N: FIND text not found in <file>".
6. Do not rename any function, variable, file, setting or URL path. The names connect the parts.
   Wrong names break the system without an error.
7. Do not add new Python packages or npm packages. Everything needed is already installed.
8. Do not commit API keys, Wi-Fi passwords or face photos.
9. Do not delete or rename existing tests.
10. After all steps, run every check in PART 6. Report the real output. If a check fails, say that it failed.

---

## PART 1. What you are building (read, do not skip)

Facts:

- The ESP32-CAM serves live video (MJPEG) at `http://<camera-ip>/stream`.
- **The camera can serve only ONE viewer at a time.** A second viewer gets nothing.
- Before this change, two programs wanted that one stream:
  1. The dashboard / mobile app (to show live video).
  2. The camera AI service in `services/vision` (to detect falls and faces).
- Result: one of them always failed.

The fix:

- The camera AI service is the **only** program that opens the camera stream.
- The service keeps the newest frame (a JPEG) in memory.
- The service sends every frame to any number of viewers at a new URL:
  `http://<computer-ip>:8100/stream/<elderId>`. This is called the **relay**.
- The service gives one frame per second to the AI models, in a separate thread.
- The web backend gets a new optional setting, `VISION_STREAM_URL`. When it is set, the dashboard
  and the mobile app play the relay. When it is empty, they open the camera directly (old behaviour).

Picture:

```
ESP32-CAM /stream ──(one connection)──▶ services/vision ──▶ /stream/<elderId> ──▶ dashboard, app
                                            │
                                            └──▶ YOLO + DeepFace ──▶ POST /api/vision/event ──▶ backend
```

Words used in this document:

| Word | Meaning |
|---|---|
| `elderId` | The id of a parent (elder) in the database, for example `cmvqhqrj100027dktl0wx7bse` |
| `cameraUrl` | The camera address saved for a parent, for example `http://192.168.1.50` (no `/stream`) |
| watcher | One `CameraWatcher` object in `services/vision/vision/watcher.py`. One per camera |
| relay | The new endpoint `GET /stream/{elder_id}` in `services/vision/vision/app.py` |

---

## PART 2. Check the starting point

Run these commands from the repository root. Read the output.

```bash
ls services/vision/vision/watcher.py services/vision/vision/app.py services/vision/vision/config.py
ls apps/web/src/lib/vision.ts apps/web/src/components/LiveFeed.tsx
grep -n "class CameraWatcher" services/vision/vision/watcher.py
grep -n "def step" services/vision/vision/watcher.py
```

Expected: all files exist, and both `grep` commands print one line.
If a file does not exist, **STOP** and tell the user. This document needs the camera AI code
(`services/vision`) that is already merged.

---

## PART 3. Change the camera AI service (Python)

### Step 3.1 — `services/vision/vision/watcher.py`: replace the camera reading code

This step replaces the start of the `CameraWatcher` class. It is the biggest step. Be careful.

How to do it:

1. Open `services/vision/vision/watcher.py`.
2. Find the line that starts with `class CameraWatcher(threading.Thread):`.
3. Find the line `    def step(self, frame, now: float):` (4 spaces before `def`).
4. **Delete every line from `class CameraWatcher(threading.Thread):` down to the line just before
   `    def step(self, frame, now: float):`.** Keep the `def step` line and everything after it.
5. In the place of the deleted lines, insert the code below exactly.

Insert this code:

```python
class CameraWatcher(threading.Thread):
    """Reads one camera and keeps its newest JPEG. The camera AI analyses that frame once per
    ANALYZE_EVERY_S, and the relay (GET /stream/<elderId>) sends every frame on to the dashboard and
    the app. So the ESP32-CAM has only one viewer, this service, however many people watch."""

    def __init__(self, elder_id: str, source: str, gallery_ref):
        super().__init__(daemon=True, name=f"cam-{elder_id}")
        self.elder_id, self.source, self.gallery_ref = elder_id, source, gallery_ref
        self.stopped = threading.Event()
        self.tracker = FallTracker(config.FALL_TRANSITION_S, config.FALL_CONFIRM_S)
        self.last_people: list[dict] = []
        self.last_sent = (None, 0.0)
        self.last_face_at = 0.0
        self.jpeg: bytes | None = None
        self.seq = 0  # +1 per frame, so viewers and the analyser know when a new one is in

    def publish(self, jpeg: bytes):
        self.jpeg, self.seq = jpeg, self.seq + 1

    def run(self):
        threading.Thread(target=self.analyse_loop, daemon=True, name=f"ai-{self.elder_id}").start()
        if not self.source.startswith("http"):
            return self.run_webcam()
        if not self.source.endswith("/stream"):
            return self.run_snapshots()
        return self.run_mjpeg()

    def run_mjpeg(self):
        """The ESP32-CAM's multipart MJPEG stream: cut it into JPEGs at the start/end markers."""
        timeout = httpx.Timeout(10, read=30)
        while not self.stopped.is_set():
            try:
                with httpx.stream("GET", self.source, timeout=timeout) as r:
                    r.raise_for_status()
                    log.info("camera %s connected", self.elder_id)
                    buf = b""
                    for chunk in r.iter_bytes():
                        if self.stopped.is_set():
                            return
                        buf += chunk
                        while True:
                            start = buf.find(b"\xff\xd8")
                            end = buf.find(b"\xff\xd9", start + 2) if start >= 0 else -1
                            if end < 0:
                                buf = buf[start:] if start >= 0 else buf[-1:]
                                break
                            self.publish(buf[start : end + 2])
                            buf = buf[end + 2 :]
                log.warning("camera %s ended its stream, reconnecting", self.elder_id)
            except httpx.HTTPError as err:
                log.warning("camera %s not reachable (%s): %r", self.elder_id, self.source, err)
            self.stopped.wait(5)

    def run_webcam(self):
        """A local webcam (CAMERA_SOURCES=<elderId>=0), for a demo without the ESP32-CAM."""
        cap = None
        while not self.stopped.is_set():
            if cap is None or not cap.isOpened():
                cap = cv2.VideoCapture(int(self.source) if self.source.isdigit() else self.source)
                if not cap.isOpened():
                    log.warning("camera %s not reachable (%s), retrying", self.elder_id, self.source)
                    self.stopped.wait(10)
                    continue
            ok, frame = cap.read()
            if not ok:
                cap.release()
                cap = None
                continue
            ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ok:
                self.publish(jpeg.tobytes())
        if cap is not None:
            cap.release()

    def run_snapshots(self):
        """One JPEG per analysis from a camera snapshot URL (CAMERA_PATH)."""
        with httpx.Client(timeout=10) as client:
            while not self.stopped.is_set():
                started = time.monotonic()
                try:
                    r = client.get(self.source)
                    r.raise_for_status()
                    self.publish(r.content)
                except httpx.HTTPError as err:
                    log.warning("camera %s not reachable (%s): %s", self.elder_id, self.source, err)
                    self.stopped.wait(10)
                    continue
                self.stopped.wait(max(0.0, config.ANALYZE_EVERY_S - (time.monotonic() - started)))

    def analyse_loop(self):
        """The models take longer than a frame, so they run here and never slow down the relay."""
        seen = 0
        while not self.stopped.wait(config.ANALYZE_EVERY_S):
            if self.seq == seen or self.jpeg is None:
                continue
            seen = self.seq
            frame = cv2.imdecode(np.frombuffer(self.jpeg, np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                continue
            try:
                self.step(frame, time.monotonic())
            except Exception:  # one bad frame must not stop fall detection for good
                log.exception("analysis failed for %s", self.elder_id)

```

Important details (check each one):

- `b"\xff\xd8"` and `b"\xff\xd9"` are bytes with a **single** backslash. They are the start and the
  end markers of a JPEG. Do not write `\\xff`.
- Every method is indented with 4 spaces inside the class. The bodies use 8, 12, 16 … spaces.
- There is **one empty line** between `log.exception(...)` and `    def step(...)`.
- Do **not** change `def step(...)`, `post_event`, `camera_sources` or `WatcherManager`.
- The old methods `_open` and the old `run` that used `cap.grab()` must be gone after this step.

Check:

```bash
grep -c "cap.grab\|def _open" services/vision/vision/watcher.py     # expected: 0
grep -c "def publish\|def run_mjpeg\|def analyse_loop" services/vision/vision/watcher.py   # expected: 3
services/vision/.venv/bin/python -c "import ast,sys; ast.parse(open('services/vision/vision/watcher.py').read()); print('ok')"   # expected: ok
```

### Step 3.2 — `services/vision/vision/app.py`: add imports

FIND:

```python
import logging
from contextlib import asynccontextmanager
```

REPLACE WITH:

```python
import asyncio
import logging
from contextlib import asynccontextmanager
```

### Step 3.3 — `services/vision/vision/app.py`: add the StreamingResponse import

FIND:

```python
from fastapi import FastAPI, File, HTTPException, UploadFile
```

REPLACE WITH:

```python
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
```

### Step 3.4 — `services/vision/vision/app.py`: remember the watcher manager

FIND:

```python
state = {"gallery": {}}
```

REPLACE WITH:

```python
state = {"gallery": {}, "manager": None}
```

### Step 3.5 — `services/vision/vision/app.py`: store the manager when it starts

FIND:

```python
        manager = WatcherManager(gallery)
        manager.start()
```

REPLACE WITH:

```python
        manager = state["manager"] = WatcherManager(gallery)
        manager.start()
```

### Step 3.6 — `services/vision/vision/app.py`: add the relay endpoint

FIND:

```python
@app.post("/faces/reload")
```

REPLACE WITH:

```python
@app.get("/stream/{elder_id}")
async def stream(elder_id: str):
    """The camera's live video, relayed: the ESP32-CAM serves one viewer, this serves many."""
    manager = state["manager"]
    watcher = manager.watchers.get(elder_id) if manager else None
    if watcher is None:
        raise HTTPException(404, "no camera watched for this parent")

    async def frames():
        seen = 0
        while not watcher.stopped.is_set():
            if watcher.seq != seen and watcher.jpeg:
                seen, jpeg = watcher.seq, watcher.jpeg
                yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n%b\r\n" % (len(jpeg), jpeg)
            await asyncio.sleep(0.03)

    return StreamingResponse(
        frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"},
    )


@app.post("/faces/reload")
```

Important details:

- The boundary word is `frame` in **both** places: `b"--frame\r\n..."` and `boundary=frame`. If they
  are different, browsers show nothing.
- `\r\n` uses a single backslash.
- There are **two** empty lines before `@app.post("/faces/reload")`.

### Step 3.7 — `services/vision/vision/app.py`: update the run command in the top comment

FIND:

```python
Run:  uvicorn vision.app:app --port 8100
```

REPLACE WITH:

```python
Run:  uvicorn vision.app:app --host 0.0.0.0 --port 8100   (0.0.0.0 so phones can open the relayed video)
```

### Step 3.8 — `services/vision/vision/config.py`: update the comment (the value does NOT change)

FIND:

```python
# How frames are read from the ESP32-CAM. "/stream" keeps its MJPEG stream open. Many ESP32-CAM
# sketches serve only one stream viewer at a time, so if the dashboard's live feed stops while this
# service runs, set a snapshot path the firmware has (e.g. "/capture" or "/cam-hi.jpg"): the service
# then fetches one JPEG per analysis and leaves the stream free for the family.
```

REPLACE WITH:

```python
# How frames are read from the ESP32-CAM. "/stream" (the default) keeps its one MJPEG stream open;
# this service is then the camera's only viewer and relays the video at /stream/<elderId> for the
# dashboard and the app (set VISION_STREAM_URL in apps/web). A snapshot path (e.g. "/capture") fetches
# one JPEG per analysis instead, for a camera that has one.
```

The next line must stay exactly: `CAMERA_PATH = os.getenv("CAMERA_PATH", "/stream")`.
**Do not change `/stream` to anything else.**

---

## PART 4. Change the web backend and dashboard (TypeScript, `apps/web`)

### Step 4.1 — `apps/web/src/lib/vision.ts`: add two helper functions

FIND:

```ts
export function requireVisionService(request: NextRequest) {
```

REPLACE WITH:

```ts
// Where browsers and phones load a parent's live video. The ESP32-CAM serves its stream to one
// viewer at a time, so with VISION_STREAM_URL set the camera AI service is that viewer and relays the
// video to everyone; without it, they load the camera directly (and the camera AI can't watch).
export function relayStreamUrl(elderId: string) {
  const relay = process.env.VISION_STREAM_URL?.replace(/\/$/, "");
  return relay ? `${relay}/stream/${elderId}` : null;
}

export function liveStreamUrl(elder: { id: string; cameraUrl: string | null }) {
  if (!elder.cameraUrl) return null;
  return relayStreamUrl(elder.id) ?? `${elder.cameraUrl.replace(/\/$/, "")}/stream`;
}

export function requireVisionService(request: NextRequest) {
```

What they do:

- `relayStreamUrl("abc")` returns `"http://192.168.1.20:8100/stream/abc"` when
  `VISION_STREAM_URL=http://192.168.1.20:8100`, and `null` when the setting is empty.
- `liveStreamUrl(elder)` returns the relay URL if there is one, else `<cameraUrl>/stream`, else `null`
  when the parent has no camera.

### Step 4.2 — `apps/web/src/components/LiveFeed.tsx`: add the `relayUrl` prop

FIND:

```tsx
  cameraUrl,
}: {
  elderId: string;
  elderName: string;
  cameraUrl: string | null;
}) {
```

REPLACE WITH:

```tsx
  cameraUrl,
  relayUrl,
}: {
  elderId: string;
  elderName: string;
  cameraUrl: string | null;
  relayUrl: string | null; // the camera AI's copy of the stream (see relayStreamUrl)
}) {
```

### Step 4.3 — `apps/web/src/components/LiveFeed.tsx`: play the relay when there is one

FIND:

```tsx
            src={`${url}/stream`}
```

REPLACE WITH:

```tsx
            src={relayUrl ?? `${url}/stream`}
```

Do **not** import anything from `@/lib/vision` in `LiveFeed.tsx`. It is a client component
(`"use client"`), and `@/lib/vision` uses the database. The value comes in as a prop.

### Step 4.4 — `apps/web/src/app/(app)/elders/[id]/health/page.tsx`: import the helper

FIND:

```tsx
import { BathroomSensorCard } from "@/components/BathroomSensorCard";
```

REPLACE WITH:

```tsx
import { BathroomSensorCard } from "@/components/BathroomSensorCard";
import { relayStreamUrl } from "@/lib/vision";
```

### Step 4.5 — `apps/web/src/app/(app)/elders/[id]/health/page.tsx`: pass the prop

FIND:

```tsx
        <LiveFeed elderId={id} elderName={elder.name} cameraUrl={elder.cameraUrl} />
```

REPLACE WITH:

```tsx
        <LiveFeed elderId={id} elderName={elder.name} cameraUrl={elder.cameraUrl} relayUrl={relayStreamUrl(id)} />
```

If `<LiveFeed` is used in another file too, search with
`grep -rn "<LiveFeed" apps/web/src` and add `relayUrl={relayStreamUrl(<the elder id>)}` there too,
with the same import. Otherwise the type check in PART 6 fails.

### Step 4.6 — `apps/web/src/app/api/elders/[id]/route.ts`: import the helper

FIND:

```ts
import { isValidTimeZone } from "@/lib/time";
```

REPLACE WITH:

```ts
import { isValidTimeZone } from "@/lib/time";
import { liveStreamUrl } from "@/lib/vision";
```

### Step 4.7 — `apps/web/src/app/api/elders/[id]/route.ts`: send `streamUrl` to caregivers

This file has more than one `return NextResponse.json({ elder });`. Change **only** the one at the
end of the `GET` handler, just before `const patchSchema`.

FIND:

```ts
  return NextResponse.json({ elder });
});

const patchSchema = z.object({
```

REPLACE WITH:

```ts
  return NextResponse.json({ elder: { ...elder, streamUrl: liveStreamUrl(elder) } });
});

const patchSchema = z.object({
```

Do not change the other `return NextResponse.json(...)` lines (the device branch and the `PATCH` handler).

### Step 4.8 — `apps/web/src/app/api/elders/[id]/route.ts`: update one comment

FIND:

```ts
  // ESP32-CAM base URL; the dashboard loads {cameraUrl}/stream directly from the browser.
```

REPLACE WITH:

```ts
  // ESP32-CAM base URL. Viewers load {cameraUrl}/stream, or the camera AI's relay (VISION_STREAM_URL).
```

### Step 4.9 — `apps/web/.env.example`: document the new setting

FIND:

```
VISION_TOKEN=""
```

REPLACE WITH:

```
VISION_TOKEN=""
# Address of the camera AI service as browsers and phones reach it (e.g. "http://192.168.1.10:8100").
# Set it when the service runs: the live feed then plays the service's relayed copy of the ESP32-CAM
# stream, because the camera serves only one viewer and the service must be that viewer.
VISION_STREAM_URL=""
```

Do **not** put a real IP address or a real token in `.env.example`. Real values go only in
`apps/web/.env` or `apps/web/.env.local`, which git ignores.

---

## PART 5. Change the mobile app (`apps/mobile`)

### Step 5.1 — `apps/mobile/src/api.ts`: add the field to the type

FIND:

```ts
  cameraUrl: string | null;
  helpCaregiverId: string | null;
```

REPLACE WITH:

```ts
  cameraUrl: string | null;
  streamUrl?: string | null; // where to load the live video (the camera, or the camera AI's relay)
  helpCaregiverId: string | null;
```

### Step 5.2 — `apps/mobile/src/screens/caretaker/ParentDetail.tsx`: pass the field

FIND:

```tsx
      <CameraSection cameraUrl={details.data?.cameraUrl ?? null} first={first} />
```

REPLACE WITH:

```tsx
      <CameraSection cameraUrl={details.data?.cameraUrl ?? null} streamUrl={details.data?.streamUrl ?? null} first={first} />
```

### Step 5.3 — `apps/mobile/src/screens/caretaker/ParentDetail.tsx`: use the field

Make two changes in the `CameraSection` function.

Change A. FIND:

```tsx
// The ESP32-CAM serves MJPEG at {cameraUrl}/stream; React Native's Image can't play that, a WebView can.
function CameraSection({ cameraUrl, first }: { cameraUrl: string | null; first: string }) {
```

REPLACE WITH:

```tsx
// The ESP32-CAM serves MJPEG at {cameraUrl}/stream (or the camera AI relays it, streamUrl); React
// Native's Image can't play that, a WebView can.
function CameraSection({ cameraUrl, streamUrl, first }: { cameraUrl: string | null; streamUrl: string | null; first: string }) {
```

Change B. In the long `const html = ...` line of the same function, FIND this part only:

```
<img src="${url}/stream"
```

REPLACE it with:

```
<img src="${streamUrl ?? `${url}/stream`}"
```

Keep the rest of that long line exactly as it is. The inner backticks are correct: they are a
template string inside a template string.

---

## PART 6. Checks. Run all of them. Report the real output.

Run from the repository root.

### Check 6.1 — no camera code changed

```bash
git diff --stat -- firmware/esp32-cam/esp32_cam_livefeed.ino
```

Expected: **no output**. If there is output, undo your change to that file:
`git checkout -- firmware/esp32-cam/esp32_cam_livefeed.ino`.

### Check 6.2 — web type check and lint

```bash
cd apps/web
npx tsc --noEmit
npx eslint src/lib/vision.ts src/components/LiveFeed.tsx "src/app/(app)/elders/[id]/health/page.tsx" "src/app/api/elders/[id]/route.ts"
cd ../..
```

Expected: no output from either command.

### Check 6.3 — web tests

```bash
cd apps/web
npx vitest run tests/integration/vision.test.ts
cd ../..
```

Expected: all tests pass.

### Check 6.4 — Python tests

```bash
cd services/vision
.venv/bin/python -m pytest -q tests
cd ../..
```

Expected: `5 passed`. (If `.venv` does not exist, the user must install the service first, see
CAMERA_AI_SETUP.md section 5. Report that; do not install packages yourself without asking.)

### Check 6.5 — relay test without the real camera (optional, needs the service set up)

This proves that one camera stream reaches many viewers and the AI.

1. Make a fake camera that, like the ESP32-CAM, allows one viewer. Save this as
   `/tmp/fakecam.py` (outside the repository):

   ```python
   import sys, time
   from http.server import BaseHTTPRequestHandler, HTTPServer
   B = b"123456789000000000000987654321"
   class H(BaseHTTPRequestHandler):
       def do_GET(self):
           if self.path != "/stream":
               self.send_response(404); self.end_headers(); return
           self.send_response(200)
           self.send_header("Content-Type", "multipart/x-mixed-replace;boundary=" + B.decode())
           self.end_headers()
           try:
               while True:
                   img = open(sys.argv[1], "rb").read()
                   self.wfile.write(b"\r\n--" + B + b"\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % len(img) + img)
                   time.sleep(0.1)
           except Exception:
               pass
   HTTPServer(("127.0.0.1", 18090), H).serve_forever()
   ```

2. Start it with any photo of a person:
   `services/vision/.venv/bin/python /tmp/fakecam.py services/vision/.venv/lib/python3.11/site-packages/ultralytics/assets/bus.jpg`
3. In the dashboard, set one parent's camera to `http://127.0.0.1:18090`.
4. Start the web app with `VISION_TOKEN` and `VISION_STREAM_URL=http://localhost:8100` in `apps/web/.env`.
5. Start the service (see CAMERA_AI_SETUP.md section 7).
6. Run:
   ```bash
   curl -s -m 5 localhost:8100/stream/<elderId> | grep -ac "Content-Type: image/jpeg"
   ```
   Expected: a number bigger than 10.
7. Run the same command in two terminals at the same time. Expected: both print a number bigger than 10.
8. The service log shows `POST .../api/vision/event "HTTP/1.1 200 OK"`.
9. Undo the test: set the parent's camera back, stop the fake camera.

If you get HTTP 500 and the web log says `column ... does not exist`, run `npx prisma db push` in
`apps/web` and try again. This is a database setup problem, not a problem in your change.

---

## PART 7. Common mistakes. Do not make them.

| Mistake | What breaks |
|---|---|
| You changed the ESP32-CAM sketch (added `/capture`, a second server, another port) | The user said the camera code is fixed. Undo it |
| You wrote `b"\\xff\\xd8"` (two backslashes) | No frame is ever found. The relay is empty, the AI sees nothing |
| Different boundary words in the relay | Browsers show a broken image |
| You imported `@/lib/vision` in `LiveFeed.tsx` | Build error: database code in a client component |
| You changed `CAMERA_PATH` default from `/stream` | The service does not read the ESP32-CAM |
| You ran the AI inside `run_mjpeg` instead of `analyse_loop` | The video stutters and the camera connection times out |
| You changed every `return NextResponse.json({ elder })` | Devices get data they must not get, or PATCH breaks |
| `VISION_STREAM_URL=http://localhost:8100` for phones | Phones cannot open `localhost` of the computer. Use the computer's Wi-Fi IP |
| You opened `http://<camera-ip>/stream` in a browser while the service runs | The camera has one viewer only. Close the tab |

---

## PART 8. What to tell the user at the end

Tell the user, with real results:

1. Which steps you did, and which steps were already done.
2. The output of each check in PART 6 (pass or fail).
3. What the user must set by hand in `apps/web/.env` (not committed):
   ```
   VISION_TOKEN=<same secret as the service>
   VISION_STREAM_URL=http://<computer-wifi-ip>:8100
   ```
4. That the service must start with `--host 0.0.0.0` so phones can open the relay.
5. That nothing in `firmware/esp32-cam/esp32_cam_livefeed.ino` changed.
