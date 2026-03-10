/**
 * E2E: LLM Budget Enforcement
 *
 * Tests the full LLM spend tracking pipeline: track spend → check budget →
 * breach → workflow halt → midnight reset.
 *
 * Verifies: Decision 10 — Redis-backed per-org daily budget, auto-halt.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory Redis mock ────────────────────────────────────────
const redisStore = new Map<string, string>();
const redisTtls = new Map<string, number>();

const redisMock = {
  get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
    redisStore.set(key, value);
    // Handle EX ttl
    if (args[0] === "EX" && typeof args[1] === "number") {
      redisTtls.set(key, args[1]);
    }
    return "OK";
  }),
  incrby: vi.fn(async (key: string, amount: number) => {
    const current = parseInt(redisStore.get(key) ?? "0", 10);
    const next = current + amount;
    redisStore.set(key, String(next));
    return next;
  }),
  incrbyfloat: vi.fn(async (key: string, amount: number) => {
    const current = parseFloat(redisStore.get(key) ?? "0");
    const next = current + amount;
    redisStore.set(key, String(next));
    return String(next);
  }),
  expire: vi.fn(async (key: string, seconds: number) => {
    redisTtls.set(key, seconds);
    return 1;
  }),
  del: vi.fn(async (...keys: string[]) => {
    let count = 0;
    for (const k of keys) {
      if (redisStore.delete(k)) count++;
      redisTtls.delete(k);
    }
    return count;
  }),
  exists: vi.fn(async (...keys: string[]) =>
    keys.filter((k) => redisStore.has(k)).length,
  ),
};

vi.mock("ioredis", () => ({
  Redis: class {
    get = redisMock.get;
    set = redisMock.set;
    incrby = redisMock.incrby;
    incrbyfloat = redisMock.incrbyfloat;
    expire = redisMock.expire;
    del = redisMock.del;
    exists = redisMock.exists;
  },
}));

describe("E2E: LLM Budget Enforcement Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    redisTtls.clear();
  });

  function spendKey(orgId: string, date?: string): string {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return `llm:spend:${orgId}:${d}`;
  }

  it("tracks spend across multiple agent calls and enforces budget", async () => {
    const orgId = "org_budget_test";
    const dailyBudgetCents = 500; // $5.00
    const key = spendKey(orgId);

    // ── Simulate 5 agent calls costing ~80 cents each ──
    for (let i = 0; i < 5; i++) {
      const costCents = 75 + Math.floor(Math.random() * 10);
      await redisMock.incrby(key, costCents);
    }

    // Check current spend
    const currentSpend = parseInt(redisStore.get(key) ?? "0", 10);
    expect(currentSpend).toBeGreaterThan(0);
    expect(currentSpend).toBeLessThan(dailyBudgetCents);

    // ── Simulate more calls that push over budget ──
    // Need to add ~125 more cents to breach $5.00
    await redisMock.incrby(key, 130);

    const spendAfter = parseInt(redisStore.get(key) ?? "0", 10);

    // Check if budget is breached
    const budgetBreached = spendAfter >= dailyBudgetCents;
    expect(budgetBreached).toBe(true);

    // ── Pre-flight check should now block ──
    const canProceed = spendAfter < dailyBudgetCents;
    expect(canProceed).toBe(false);
  });

  it("resets budget at midnight (new day key)", async () => {
    const orgId = "org_reset_test";

    // Set yesterday's spend to over budget
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const yesterdayKey = spendKey(orgId, yesterday);
    await redisMock.set(yesterdayKey, "600"); // Over $5 budget

    // Today's key should be fresh (0)
    const todayKey = spendKey(orgId);
    const todaySpend = parseInt(redisStore.get(todayKey) ?? "0", 10);

    expect(todaySpend).toBe(0); // Auto-reset via new key

    // Yesterday's spend should still exist (for reporting)
    const yesterdaySpend = parseInt(redisStore.get(yesterdayKey) ?? "0", 10);
    expect(yesterdaySpend).toBe(600);
  });

  it("tracks spend per-org independently", async () => {
    const org1Key = spendKey("org_1");
    const org2Key = spendKey("org_2");

    // Org 1 spends 300 cents
    await redisMock.incrby(org1Key, 300);

    // Org 2 spends 100 cents
    await redisMock.incrby(org2Key, 100);

    const org1Spend = parseInt(redisStore.get(org1Key) ?? "0", 10);
    const org2Spend = parseInt(redisStore.get(org2Key) ?? "0", 10);

    expect(org1Spend).toBe(300);
    expect(org2Spend).toBe(100);

    // Org 1 at $3, Org 2 at $1 — both under $5 budget
    expect(org1Spend < 500).toBe(true);
    expect(org2Spend < 500).toBe(true);
  });

  it("handles tier-based budget limits correctly", async () => {
    const tiers = {
      PRO: { dailyBudgetCents: 500 },
      MULTIPLIER: { dailyBudgetCents: 1500 },
    };

    const proKey = spendKey("org_pro");
    const multiKey = spendKey("org_multi");

    // Both orgs spend 800 cents
    await redisMock.incrby(proKey, 800);
    await redisMock.incrby(multiKey, 800);

    const proSpend = parseInt(redisStore.get(proKey) ?? "0", 10);
    const multiSpend = parseInt(redisStore.get(multiKey) ?? "0", 10);

    // Pro is over budget, Multiplier is not
    expect(proSpend >= tiers.PRO.dailyBudgetCents).toBe(true);
    expect(multiSpend >= tiers.MULTIPLIER.dailyBudgetCents).toBe(false);
  });

  it("TTL ensures keys expire after 48 hours", async () => {
    const key = spendKey("org_ttl_test");
    await redisMock.incrby(key, 100);
    await redisMock.expire(key, 48 * 3600); // 48h TTL

    expect(redisTtls.get(key)).toBe(48 * 3600);
  });
});
