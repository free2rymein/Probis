import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_STANDALONE === "true" ? "standalone" : undefined,
  reactStrictMode: true,
  transpilePackages: ["@probis/types", "@probis/shared", "@probis/database"]
};

export default nextConfig;
