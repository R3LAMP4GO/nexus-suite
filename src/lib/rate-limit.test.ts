import { describe, it, expect, vi, beforeEach } from "vitest";

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    incr: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: redisMock,
}));

import { checkRateLimit, AUTH_LIMIT, OAUTH_LIMIT, WEBHOOK_LIMIT, MUTATION_LIMIT } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows request when count is within limit", async () => {
    redisMock.incr.mockResolvedValue(1);
    const result = await checkRateLimit("test-key", { limit: 10, windowSecs: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
  });

  it("sets TTL on first request in window", async () => {
    redisMock.incr.mockResolvedValue(1);
    await checkRateLimit("test-key", { limit: 10, windowSecs: 60 });
    expect(redisMock.expire).toHaveBeenCalledWith(expect.stringContaining("rl:test-key:"), 60);
  });

  it("does not set TTL on subsequent requests", async () => {
    redisMock.incr.mockResolvedValue(5);
    await checkRateLimit("test-key", { limit: 10, windowSecs: 60 });
    expect(redisMock.expire).not.toHaveBeenCalled();
  });

  it("blocks request when count exceeds limit", async () => {
    redisMock.incr.mockResolvedValue(11);
    const result = await checkRateLimit("test-key", { limit: 10, windowSecs: 60 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("blocks request when count equals limit + 1", async () => {
    redisMock.incr.mockResolvedValue(11);
    const result = await checkRateLimit("test-key", { limit: 10, windowSecs: 60 });
    expect(result.allowed).toBe(false);
  });

  it("allows request at exactly the limit", async () => {
    redisMock.incr.mockResolvedValue(10);
    const result = await checkRateLimit("test-key", { limit: 10, windowSecs: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("remaining never goes below 0", async () => {
    redisMock.incr.mockResolvedValue(100);
    const result = await checkRateLimit("test-key", { limit: 10, windowSecs: 60 });
    expect(result.remaining).toBe(0);
  });

  describe("preset configs", () => {
    it("AUTH_LIMIT allows 10 per 60s", () => {
      expect(AUTH_LIMIT).toEqual({ limit: 10, windowSecs: 60 });
    });

    it("OAUTH_LIMIT allows 20 per 60s", () => {
      expect(OAUTH_LIMIT).toEqual({ limit: 20, windowSecs: 60 });
    });

    it("WEBHOOK_LIMIT allows 100 per 60s", () => {
      expect(WEBHOOK_LIMIT).toEqual({ limit: 100, windowSecs: 60 });
    });

    it("MUTATION_LIMIT allows 60 per 60s", () => {
      expect(MUTATION_LIMIT).toEqual({ limit: 60, windowSecs: 60 });
    });
  });
});
