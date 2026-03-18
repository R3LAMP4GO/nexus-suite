#!/usr/bin/env npx tsx
/**
 * Seed platform OAuth app credentials into Infisical.
 *
 * Run once (from your machine where .env has the real values):
 *   npx tsx scripts/seed-oauth-secrets.ts
 *
 * After this, any team member with Infisical access can run the app
 * without needing social OAuth creds in their .env — the app fetches
 * them from Infisical at runtime via platform-credentials.ts.
 */

import "dotenv/config";
import { storeSecret } from "../src/lib/infisical";

const PROJECT_ID = process.env.INFISICAL_PROJECT_ID ?? "";
const ENV = process.env.INFISICAL_ENV ?? "production";
const SECRET_PATH = "/platform-oauth";

const CREDENTIALS: Record<string, string | undefined> = {
  // YouTube
  YOUTUBE_OAUTH_CLIENT_ID: process.env.YOUTUBE_OAUTH_CLIENT_ID,
  YOUTUBE_OAUTH_CLIENT_SECRET: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
  // Facebook
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
  // Instagram
  INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,
  INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET,
  // TikTok
  TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
  TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
  // LinkedIn
  LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET,
  // X (Twitter)
  X_CLIENT_ID: process.env.X_CLIENT_ID,
  X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
  X_API_KEY: process.env.X_API_KEY,
  X_API_SECRET: process.env.X_API_SECRET,
  X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET,
};

async function main() {
  if (!PROJECT_ID) {
    console.error("❌ INFISICAL_PROJECT_ID is not set in .env");
    process.exit(1);
  }

  console.log(`📦 Seeding OAuth credentials into Infisical...`);
  console.log(`   Project: ${PROJECT_ID}`);
  console.log(`   Environment: ${ENV}`);
  console.log(`   Path: ${SECRET_PATH}\n`);

  let stored = 0;
  let skipped = 0;

  for (const [name, value] of Object.entries(CREDENTIALS)) {
    if (!value || value === "placeholder") {
      console.log(`   ⏭  ${name} — skipped (empty/placeholder)`);
      skipped++;
      continue;
    }

    try {
      await storeSecret(PROJECT_ID, ENV, SECRET_PATH, name, value);
      console.log(`   ✅ ${name}`);
      stored++;
    } catch (err) {
      console.error(`   ❌ ${name} — failed:`, err);
    }
  }

  console.log(`\n🎉 Done! ${stored} secrets stored, ${skipped} skipped.`);
  console.log(
    `\nYour team members now only need these in their .env:\n` +
      `  INFISICAL_SITE_URL=...\n` +
      `  INFISICAL_PROJECT_ID=${PROJECT_ID}\n` +
      `  INFISICAL_ENV=${ENV}\n` +
      `  INFISICAL_CLIENT_ID=...\n` +
      `  INFISICAL_CLIENT_SECRET=...\n`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
