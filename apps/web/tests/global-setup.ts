import { execSync } from "node:child_process";

// Fresh schema for every run.
export default function setup() {
  execSync("npx prisma db push --force-reset --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
}
