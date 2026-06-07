import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Allow requests to the dev server from this LAN host (e.g. testing on a phone).
  allowedDevOrigins: ["192.168.1.101", "192.168.1.104"],
};

export default nextConfig;
