import os

# All settings come from the environment, so the same code runs on a laptop or a small server.
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3000").rstrip("/")
VISION_TOKEN = os.getenv("VISION_TOKEN", "")

# Extra or override cameras: "elderId=source,elderId=source". A source is a stream URL or a webcam
# index ("0" = the laptop camera, handy for a demo without the ESP32-CAM).
CAMERA_SOURCES = os.getenv("CAMERA_SOURCES", "")

# How frames are read from the ESP32-CAM. "/stream" (the default) keeps its one MJPEG stream open;
# this service is then the camera's only viewer and relays the video at /stream/<elderId> for the
# dashboard and the app (set VISION_STREAM_URL in apps/web). A snapshot path (e.g. "/capture") fetches
# one JPEG per analysis instead, for a camera that has one.
CAMERA_PATH = os.getenv("CAMERA_PATH", "/stream")

POSE_MODEL = os.getenv("POSE_MODEL", "yolo11n-pose.pt")  # downloaded by Ultralytics on first run
PERSON_CONF = float(os.getenv("PERSON_CONF", "0.5"))
FACE_MODEL = os.getenv("FACE_MODEL", "Facenet512")
FACE_DETECTOR = os.getenv("FACE_DETECTOR", "opencv")
FACE_MAX_DISTANCE = float(os.getenv("FACE_MAX_DISTANCE", "0.30"))  # cosine distance; DeepFace's threshold for Facenet512
FACES_DIR = os.getenv("FACES_DIR", os.path.join(os.path.dirname(__file__), "..", "faces"))

ANALYZE_EVERY_S = float(os.getenv("ANALYZE_EVERY_S", "1.0"))
FACE_EVERY_S = float(os.getenv("FACE_EVERY_S", "5.0"))
HEARTBEAT_S = float(os.getenv("HEARTBEAT_S", "60"))

# Fall rule: upright (standing/sitting) and then lying within FALL_TRANSITION_S, still lying after FALL_CONFIRM_S.
FALL_TRANSITION_S = float(os.getenv("FALL_TRANSITION_S", "3"))
FALL_CONFIRM_S = float(os.getenv("FALL_CONFIRM_S", "10"))
