import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@prisma/client",
    "ioredis",
    "@infisical/sdk",
    "pg-boss",
    "bullmq",
  ],
};

export default nextConfig;
