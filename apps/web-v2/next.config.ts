import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep production builds from invalidating CSS assets served by a running dev server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  output: process.env.DOCKER_STANDALONE === "true" ? "standalone" : undefined,
  reactStrictMode: true
};

export default nextConfig;
