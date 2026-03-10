import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateLimiter } from "../rate-limiter";

function createMockRedis() {
  return {
    eval: vi.fn(),
  } as any;
}

describe("RateLimiter", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let limiter: RateLimiter;

  beforeEach(() => {
    redis = createMockRedis();
    limiter = new RateLimiter(redis);
  });

  it("acquires token when Lua script returns 1", async () => {
    redis.eval.mockResolvedValue(1);

    await limiter.acquireToken("example.com");

    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("local key = KEYS[1]"),
      1,
      "scraper:ratelimit:example.com",
      10, // default tokens
      60000, // default intervalMs
      expect.any(Number),
    );
  });

  it("uses correct Redis key format: scraper:ratelimit:{domain}", async () => {
    redis.eval.mockResolvedValue(1);

    await limiter.acquireToken("tiktok.com");

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "scraper:ratelimit:tiktok.com",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("retries when Lua script returns 0 then succeeds", async () => {
    vi.useFakeTimers();

    redis.eval
      .mockResolvedValueOnce(0) // first try: no tokens
      .mockResolvedValueOnce(1); // second try: token available

    const promise = limiter.acquireToken("example.com");

    // Advance past the backoff wait
    await vi.advanceTimersByTimeAsync(10_000);

    await promise;

    expect(redis.eval).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("uses per-domain config when set", async () => {
    limiter.setDomainConfig("api.example.com", { tokens: 5, intervalMs: 30000 });
    redis.eval.mockResolvedValue(1);

    await limiter.acquireToken("api.example.com");

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "scraper:ratelimit:api.example.com",
      5,
      30000,
      expect.any(Number),
    );
  });

  it("falls back to default config for unconfigured domains", async () => {
    limiter.setDomainConfig("other.com", { tokens: 2, intervalMs: 10000 });
    redis.eval.mockResolvedValue(1);

    await limiter.acquireToken("unknown.com");

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "scraper:ratelimit:unknown.com",
      10, // default
      60000, // default
      expect.any(Number),
    );
  });

  it("isolates domains — separate keys", async () => {
    redis.eval.mockResolvedValue(1);

    await limiter.acquireToken("domain-a.com");
    await limiter.acquireToken("domain-b.com");

    const keys = redis.eval.mock.calls.map((c: unknown[]) => c[2]);
    expect(keys).toEqual([
      "scraper:ratelimit:domain-a.com",
      "scraper:ratelimit:domain-b.com",
    ]);
  });

  it("passes current timestamp to Lua script", async () => {
    const before = Date.now();
    redis.eval.mockResolvedValue(1);

    await limiter.acquireToken("example.com");

    const after = Date.now();
    const passedTimestamp = redis.eval.mock.calls[0]![5] as number;
    expect(passedTimestamp).toBeGreaterThanOrEqual(before);
    expect(passedTimestamp).toBeLessThanOrEqual(after);
  });
});
