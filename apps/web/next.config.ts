import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_STANDALONE === "true" ? "standalone" : undefined,
  reactStrictMode: true,
  transpilePackages: [
    "@probis/ui",
    "@probis/types",
    "@probis/shared",
    "@probis/database",
    "@probis/intelligence"
  ]
};

export default nextConfig;
