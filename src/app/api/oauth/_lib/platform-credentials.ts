import { fetchSecret } from "@/lib/infisical";

const PROJECT_ID = process.env.INFISICAL_PROJECT_ID ?? "";
const ENV = process.env.INFISICAL_ENV ?? "production";
const SECRET_PATH = "/platform-oauth";

/**
 * Fetch a platform OAuth credential from Infisical, falling back to process.env.
 * This lets team members run without social creds in their .env — Infisical provides them.
 */
async function getCredential(secretName: string): Promise<string | undefined> {
  // 1. Check process.env first (fastest, no network)
  const envValue = process.env[secretName];
  if (envValue) return envValue;

  // 2. Fall back to Infisical
  if (!PROJECT_ID) return undefined;
  try {
    const value = await fetchSecret(PROJECT_ID, ENV, SECRET_PATH, secretName);
    return value || undefined;
  } catch {
    return undefined;
  }
}

// ── YouTube ──────────────────────────────────────────────────────
export async function getYouTubeCredentials() {
  const clientId = await getCredential("YOUTUBE_OAUTH_CLIENT_ID");
  const clientSecret = await getCredential("YOUTUBE_OAUTH_CLIENT_SECRET");
  return { clientId, clientSecret };
}

// ── Facebook ─────────────────────────────────────────────────────
export async function getFacebookCredentials() {
  const clientId = await getCredential("FACEBOOK_APP_ID");
  const clientSecret = await getCredential("FACEBOOK_APP_SECRET");
  return { clientId, clientSecret };
}

// ── Instagram ────────────────────────────────────────────────────
export async function getInstagramCredentials() {
  const clientId = await getCredential("INSTAGRAM_APP_ID");
  const clientSecret = await getCredential("INSTAGRAM_APP_SECRET");
  return { clientId, clientSecret };
}

// ── TikTok ───────────────────────────────────────────────────────
export async function getTikTokCredentials() {
  const clientKey = await getCredential("TIKTOK_CLIENT_KEY");
  const clientSecret = await getCredential("TIKTOK_CLIENT_SECRET");
  return { clientKey, clientSecret };
}

// ── LinkedIn ─────────────────────────────────────────────────────
export async function getLinkedInCredentials() {
  const clientId = await getCredential("LINKEDIN_CLIENT_ID");
  const clientSecret = await getCredential("LINKEDIN_CLIENT_SECRET");
  return { clientId, clientSecret };
}

// ── X (Twitter) ──────────────────────────────────────────────────
export async function getXCredentials() {
  const clientId = await getCredential("X_CLIENT_ID");
  const clientSecret = await getCredential("X_CLIENT_SECRET");
  const apiKey = await getCredential("X_API_KEY");
  const apiSecret = await getCredential("X_API_SECRET");
  return { clientId, clientSecret, apiKey, apiSecret };
}
