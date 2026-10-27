import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// `next dev` only trusts localhost by default, so opening the dashboard via this machine's LAN IP
// (e.g. from a phone on the same Wi-Fi) loads the page without its scripts — forms then just reload.
// Allow this machine's own IPv4 addresses, plus any extra hosts listed in DEV_ORIGINS.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...lanAddresses, ...(process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])],
};

export default nextConfig;
