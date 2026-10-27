import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit + integration tests. Integration tests call the real route handlers against a throwaway
// SQLite database (prisma/test.db), so files run one at a time.
// End-to-end tests (real Next server) live in vitest.e2e.config.ts.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret",
      SCHEDULER_DISABLED: "1",
      // Make sure tests never hit a real LLM/STT/TTS/MQTT even if the developer's shell has keys.
      GROQ_API_KEY: "",
      GEMINI_API_KEY: "",
      LLM_BASE_URL: "",
      STT_BASE_URL: "",
      TTS_BASE_URL: "",
      MQTT_URL: "",
      ELEVENLABS_API_KEY: "",
      ELEVENLABS_VOICE_ID: "",
    },
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
