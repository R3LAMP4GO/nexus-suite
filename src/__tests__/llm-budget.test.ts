import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Redis ──────────────────────────────────────────────────
const redisStore = new Map<string, string>();
const redisTtls = new Map<string, number>();

const mockRedis = {
  get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  incrby: vi.fn(async (key: string, amount: number) => {
    const current = Number(redisStore.get(key) ?? 0);
    const next = current + amount;
    redisStore.set(key, String(next));
    return next;
  }),
  ttl: vi.fn(async (key: string) => redisTtls.get(key) ?? -1),
  expire: vi.fn(async (key: string, seconds: number) => {
    redisTtls.set(key, seconds);
    return 1;
  }),
  hget: vi.fn(async () => null),
  hset: vi.fn(async () => 1),
};

vi.mock("ioredis", () => {
  return {
    Redis: class MockRedis {
      get = mockRedis.get;
      incrby = mockRedis.incrby;
      ttl = mockRedis.ttl;
      expire = mockRedis.expire;
      hget = mockRedis.hget;
      hset = mockRedis.hset;
    },
  };
});

// ── Mock Prisma ─────────────────────────────────────────────────
const mockDb = {
  organization: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ── Import after mocks ─────────────────────────────────────────
const { trackLlmSpend, checkLlmBudget } = await import(
  "@/server/services/llm-budget"
);

describe("LLM Budget", () => {
  beforeEach(() => {
    redisStore.clear();
    redisTtls.clear();
    vi.clearAllMocks();
  });

  describe("trackLlmSpend — exact math", () => {
    it("calculates prompt cost: (tokens * centsPerMillion * 100) / 1M", async () => {
      // GPT-4o: 250 cents/1M prompt tokens
      // 1000 tokens → (1000 * 250 * 100) / 1_000_000 = 25 hundredths
      const result = await trackLlmSpend("org_1", "openai/gpt-4o", 1000, 0);

      expect(mockRedis.incrby).toHaveBeenCalledWith(
        expect.stringMatching(/^llm:spend:org_1:\d{4}-\d{2}-\d{2}$/),
        25,
      );
      expect(result.addedCents).toBe(0); // 25 hundredths rounds to 0 cents
    });

    it("calculates completion cost separately", async () => {
      // GPT-4o: 1000 cents/1M completion tokens
      // 1000 tokens → (1000 * 1000 * 100) / 1_000_000 = 100 hundredths
      const result = await trackLlmSpend("org_1", "openai/gpt-4o", 0, 1000);

      expect(mockRedis.incrby).toHaveBeenCalledWith(
        expect.stringMatching(/^llm:spend:org_1:/),
        100,
      );
      expect(result.addedCents).toBe(1); // 100 hundredths = 1 cent
    });

    it("sums prompt + completion costs", async () => {
      // 1000 prompt (25 hundredths) + 1000 completion (100 hundredths) = 125 hundredths
      await trackLlmSpend("org_1", "openai/gpt-4o", 1000, 1000);

      expect(mockRedis.incrby).toHaveBeenCalledWith(
        expect.stringMatching(/^llm:spend:org_1:/),
        125,
      );
    });

    it("uses Math.ceil for sub-hundredth precision", async () => {
      // gpt-4o-mini: 15 cents/1M prompt
      // 1 token → (1 * 15 * 100) / 1_000_000 = 0.0015 → ceil = 1
      await trackLlmSpend("org_1", "openai/gpt-4o-mini", 1, 0);

      expect(mockRedis.incrby).toHaveBeenCalledWith(
        expect.stringMatching(/^llm:spend:org_1:/),
        1,
      );
    });

    it("uses conservative pricing for unknown models", async () => {
      // Unknown model falls back to GPT-4o pricing (250/1000)
      await trackLlmSpend("org_1", "unknown/model", 1_000_000, 0);

      // (1M * 250 * 100) / 1M = 25000 hundredths
      expect(mockRedis.incrby).toHaveBeenCalledWith(
        expect.stringMatching(/^llm:spend:org_1:/),
        25000,
      );
    });

    it("skips Redis write on zero tokens", async () => {
      const result = await trackLlmSpend("org_1", "openai/gpt-4o", 0, 0);

      expect(mockRedis.incrby).not.toHaveBeenCalled();
      expect(result.addedCents).toBe(0);
    });
  });

  describe("trackLlmSpend — Redis behavior", () => {
    it("sets 48h TTL on first write", async () => {
      mockRedis.ttl.mockResolvedValueOnce(-1); // no TTL set

      await trackLlmSpend("org_1", "openai/gpt-4o", 10000, 0);

      expect(mockRedis.expire).toHaveBeenCalledWith(
        expect.stringMatching(/^llm:spend:org_1:/),
        172800,
      );
    });

    it("does not reset spend TTL on subsequent writes", async () => {
      // First call sets TTL
      await trackLlmSpend("org_1", "openai/gpt-4o", 10000, 0);
      const expireCalls = mockRedis.expire.mock.calls.filter(
        ([key]: [string, number]) => key.startsWith("llm:spend:"),
      );
      const firstCallCount = expireCalls.length;

      // Second call — TTL already set, should not call expire on spend key again
      mockRedis.ttl.mockResolvedValueOnce(100000); // positive TTL
      await trackLlmSpend("org_1", "openai/gpt-4o", 10000, 0);

      const expireCallsAfter = mockRedis.expire.mock.calls.filter(
        ([key]: [string, number]) => key.startsWith("llm:spend:"),
      );
      expect(expireCallsAfter.length).toBe(firstCallCount);
    });

    it("uses atomic INCRBY", async () => {
      await trackLlmSpend("org_1", "openai/gpt-4o", 10000, 0);
      await trackLlmSpend("org_1", "openai/gpt-4o", 10000, 0);

      expect(mockRedis.incrby).toHaveBeenCalledTimes(2);
    });
  });

  describe("checkLlmBudget", () => {
    it("returns allowed=true when under budget", async () => {
      redisStore.set(
        `llm:spend:org_1:${new Date().toISOString().slice(0, 10)}`,
        "10000", // 100 hundredths → 100 cents = $1.00
      );
      mockDb.organization.findUnique.mockResolvedValueOnce({
        dailyLlmBudgetCents: 500,
        name: "Test Org",
      });

      const result = await checkLlmBudget("org_1");

      expect(result.allowed).toBe(true);
      expect(result.remainingCents).toBeGreaterThan(0);
    });

    it("returns allowed=false when budget exceeded", async () => {
      redisStore.set(
        `llm:spend:org_1:${new Date().toISOString().slice(0, 10)}`,
        "50000", // 50000 hundredths → 500 cents = $5.00
      );
      mockDb.organization.findUnique.mockResolvedValueOnce({
        dailyLlmBudgetCents: 500,
        name: "Test Org",
      });

      const result = await checkLlmBudget("org_1");

      expect(result.allowed).toBe(false);
      expect(result.remainingCents).toBe(0);
      expect(result.message).toContain("Daily LLM budget exceeded");
      expect(result.message).toContain("$5.00");
      expect(result.message).toContain("$5.00");
    });

    it("returns allowed=false when org not found", async () => {
      mockDb.organization.findUnique.mockResolvedValueOnce(null);

      const result = await checkLlmBudget("org_999");

      expect(result.allowed).toBe(false);
      expect(result.message).toContain("not found");
    });
  });
});
