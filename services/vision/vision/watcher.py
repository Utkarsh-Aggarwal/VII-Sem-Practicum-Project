"""Watches each elder's camera: reads frames, runs the pipeline, reports to the CareCircle backend."""

import logging
import threading
import time

import cv2
import httpx
import numpy as np

from . import config
from .pipeline import analyze
from .tracker import FallTracker

log = logging.getLogger("vision.watcher")


def _headers():
    return {"Authorization": f"Bearer {config.VISION_TOKEN}"}


def post_event(body: dict):
    try:
        r = httpx.post(f"{config.BACKEND_URL}/api/vision/event", json=body, headers=_headers(), timeout=10)
        if r.status_code >= 400:
            log.warning("backend refused %s: %s %s", body["type"], r.status_code, r.text[:200])
    except httpx.HTTPError as err:
        log.warning("backend unreachable: %s", err)


def camera_sources() -> dict[str, str]:
    """elderId -> stream URL (or webcam index), from the backend plus CAMERA_SOURCES overrides."""
    sources: dict[str, str] = {}
    try:
        r = httpx.get(f"{config.BACKEND_URL}/api/vision/cameras", headers=_headers(), timeout=10)
        r.raise_for_status()
        sources = {c["elderId"]: c["streamUrl"].removesuffix("/stream") + config.CAMERA_PATH for c in r.json()["cameras"]}
    except (httpx.HTTPError, KeyError, ValueError) as err:
        log.warning("couldn't load cameras from the backend: %s", err)
    for pair in filter(None, (p.strip() for p in config.CAMERA_SOURCES.split(","))):
        elder_id, _, source = pair.partition("=")
        if elder_id and source:
            sources[elder_id.strip()] = source.strip()
    return sources


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

    def step(self, frame, now: float):
        with_faces = now - self.last_face_at >= config.FACE_EVERY_S
        people = analyze(frame, self.gallery_ref().get(self.elder_id, []), with_faces=with_faces)
        if with_faces:
            self.last_face_at = now
        elif len(people) == len(self.last_people):
            # Faces run every few seconds; in between, people keep the identity they had.
            for p, prev in zip(people, self.last_people):
                p["identity"] = prev["identity"]
        self.last_people = people

        main = people[0] if people else None
        if self.tracker.update(now, main["posture"] if main else None):
            log.warning("FALL at %s (%s)", self.elder_id, main and main["identity"])
            post_event({"type": "fall", "elderId": self.elder_id, "identity": main and main["identity"], "confidence": main and main["confidence"]})

        summary = [{"posture": p["posture"], "identity": p["identity"], "confidence": round(p["confidence"], 2)} for p in people]
        key = [(p["posture"], p["identity"]) for p in summary]
        if key != self.last_sent[0] or now - self.last_sent[1] >= config.HEARTBEAT_S:
            self.last_sent = (key, now)
            post_event({"type": "observation", "elderId": self.elder_id, "people": summary})


class WatcherManager(threading.Thread):
    """Starts a watcher per camera and follows camera changes made on the dashboard."""

    def __init__(self, gallery_ref):
        super().__init__(daemon=True, name="watchers")
        self.gallery_ref = gallery_ref
        self.watchers: dict[str, CameraWatcher] = {}
        self.stopped = threading.Event()

    def run(self):
        while not self.stopped.is_set():
            wanted = camera_sources()
            for elder_id, w in list(self.watchers.items()):
                if wanted.get(elder_id) != w.source:
                    w.stopped.set()
                    del self.watchers[elder_id]
            for elder_id, source in wanted.items():
                if elder_id not in self.watchers:
                    log.info("watching %s at %s", elder_id, source)
                    self.watchers[elder_id] = CameraWatcher(elder_id, source, self.gallery_ref)
                    self.watchers[elder_id].start()
            self.stopped.wait(60)

    def stop(self):
        self.stopped.set()
        for w in self.watchers.values():
            w.stopped.set()
