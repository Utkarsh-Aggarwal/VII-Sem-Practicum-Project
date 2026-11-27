# ESP32-CAM live feed + door-status LED

`esp32_cam_livefeed.ino` runs on an AI-Thinker ESP32-CAM and does two things:

1. Serves an MJPEG video stream at `http://<esp32-ip>/stream` — this is what the CareCircle dashboard's "Live feed" card connects to.
2. Subscribes to the `home/door/status` MQTT topic on `broker.hivemq.com` and flashes the onboard flash LED (GPIO4) `HIGH` on `"UNLOCKED"` / `LOW` on `"LOCKED"`.

## Flashing it

1. Arduino IDE → Boards Manager → install **esp32 by Espressif Systems** (this pulls in `esp_camera.h`, no separate camera library needed).
2. Library Manager → install **PubSubClient** (by Nick O'Leary).
3. Tools → Board → **AI Thinker ESP32-CAM**. Tools → Partition Scheme → **Huge APP (3MB No OTA/1MB SPIFFS)**.
4. Wire the FTDI/USB-serial adapter: GPIO0 to GND *only while flashing* (remove after upload, then press reset).
5. Set `WIFI_SSID` / `WIFI_PASSWORD` at the top of the sketch. The repository has placeholders: do not commit your real password.
6. Upload, then open Serial Monitor at 115200 baud. After it connects to WiFi it prints:
   ```
   Stream URL: http://192.168.1.xx
   ```
7. On the CareCircle web dashboard, open the elder's page → **Live feed** card → **Add camera** → paste `http://192.168.1.xx` (no trailing `/stream`, the dashboard appends that itself) → Save.

## Notes

- The stream serves **one viewer at a time**. With the camera AI running, the camera AI is that viewer and relays the video to the dashboard and the app. See [docs/CAMERA_AI_SETUP.md](../../docs/CAMERA_AI_SETUP.md). Do not open `/stream` in a browser while the camera AI runs.

- The dashboard browser needs to reach that IP directly — same LAN, or a port-forward/VPN if the elder's camera and the caregiver's browser are on different networks.
- GPIO2 is avoided for the status LED because it's shared with the SD card interface on ESP32-CAM boards; GPIO4 (the onboard flash LED) is used instead.
- Frame size auto-adjusts: VGA (640x480) if the board has PSRAM (true for AI-Thinker), QVGA (320x240) as a fallback if it doesn't.
- To trigger the LED for testing, publish to the topic with any MQTT client, e.g.:
  ```
  mosquitto_pub -h broker.hivemq.com -t home/door/status -m UNLOCKED
  ```
