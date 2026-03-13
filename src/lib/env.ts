import { z } from "zod";

// ── Required env vars — app won't start without these ──────────
const requiredSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// ── Optional env vars — warn if missing, don't crash ───────────
const optionalVars = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "INFISICAL_PROJECT_ID",
  "SENTRY_DSN",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_ENDPOINT",
] as const;

// AUTH_SECRET is the NextAuth v5 name; accept either
function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET (or NEXTAUTH_SECRET) must be set to a value of at least 16 characters in production");
    }
    console.warn("[env] ⚠ AUTH_SECRET not set or too short — using insecure default for development");
    return "dev-insecure-secret-not-for-production";
  }
  return secret;
}

/**
 * Validate environment variables at boot time.
 * Throws on missing required vars. Warns on missing optional vars.
 */
export function validateEnv(): void {
  // Validate required vars
  const result = requiredSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`[env] Missing required environment variables:\n${errors}`);
  }

  // Validate auth secret
  getAuthSecret();

  // Warn about missing optional vars
  const missing = optionalVars.filter((v) => !process.env[v]);
  if (missing.length > 0 && process.env.NODE_ENV !== "test") {
    console.warn(
      `[env] ⚠ Optional env vars not set (features may be limited): ${missing.join(", ")}`,
    );
  }

  if (process.env.NODE_ENV !== "test") {
    console.log("[env] ✓ Environment validated");
  }
}

// Auto-validate on import (except in test mode where vars are mocked)
if (process.env.NODE_ENV !== "test") {
  validateEnv();
}
