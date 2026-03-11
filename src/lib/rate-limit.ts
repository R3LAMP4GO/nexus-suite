import { redis } from "@/lib/redis";

interface RateLimitConfig {
  /** Maximum number of requests in the window */
  limit: number;
  /** Window size in seconds */
  windowSecs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Sliding-window rate limiter backed by Redis.
 * Uses a simple INCR + EXPIRE pattern (fixed window, close enough for API protection).
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const windowKey = `rl:${key}:${Math.floor(Date.now() / 1000 / config.windowSecs)}`;
  const resetAt =
    (Math.floor(Date.now() / 1000 / config.windowSecs) + 1) *
    config.windowSecs *
    1000;

  const count = await redis.incr(windowKey);
  if (count === 1) {
    await redis.expire(windowKey, config.windowSecs);
  }

  return {
    allowed: count <= config.limit,
    remaining: Math.max(0, config.limit - count),
    resetAt,
  };
}

// ── Preset configs for common endpoints ──────────────────────────

/** Auth endpoints: 10 requests per 60 seconds per IP */
export const AUTH_LIMIT: RateLimitConfig = { limit: 10, windowSecs: 60 };

/** OAuth endpoints: 20 requests per 60 seconds per IP */
export const OAUTH_LIMIT: RateLimitConfig = { limit: 20, windowSecs: 60 };

/** Webhook endpoints: 100 requests per 60 seconds per IP */
export const WEBHOOK_LIMIT: RateLimitConfig = { limit: 100, windowSecs: 60 };

/** tRPC mutations: 60 requests per 60 seconds per user */
export const MUTATION_LIMIT: RateLimitConfig = { limit: 60, windowSecs: 60 };
