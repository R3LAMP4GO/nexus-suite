import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/client/runtime",
    "ioredis",
    "@infisical/sdk",
    "pg-boss",
  ],
};

export default nextConfig;
