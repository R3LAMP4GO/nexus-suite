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
  webpack: (config) => {
    // Prisma 7 generates .ts files but uses .js import extensions (ESM convention).
    // Add an alias so webpack resolves ./internal/class.js → ./internal/class.ts etc.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".js"],
    };
    return config;
  },
};

export default nextConfig;
