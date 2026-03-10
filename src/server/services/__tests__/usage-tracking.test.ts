import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Mock Prisma ─────────────────────────────────────────────────
const dbMock = {
  usageRecord: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

// ── Mock llm-budget ─────────────────────────────────────────────
const mockCheckLlmBudget = vi.fn();
vi.mock("../llm-budget", () => ({
  checkLlmBudget: (...args: unknown[]) => mockCheckLlmBudget(...args),
}));

let incrementUsage: typeof import("../usage-tracking.js")["incrementUsage"];
let checkUsageLimit: typeof import("../usage-tracking.js")["checkUsageLimit"];

beforeAll(async () => {
  const mod = await import("../usage-tracking.js");
  incrementUsage = mod.incrementUsage;
  checkUsageLimit = mod.checkUsageLimit;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("incrementUsage", () => {
  it("creates new record when first usage", async () => {
    dbMock.usageRecord.upsert.mockResolvedValue({ count: 1 });

    const count = await incrementUsage("org_1", "accounts");

    expect(count).toBe(1);
    expect(dbMock.usageRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: "org_1",
          metric: "accounts",
          count: 1,
        }),
        update: { count: { increment: 1 } },
      }),
    );
  });

  it("increments existing record", async () => {
    dbMock.usageRecord.upsert.mockResolvedValue({ count: 5 });

    const count = await incrementUsage("org_1", "videos");

    expect(count).toBe(5);
  });

  it("uses monthly period (YYYY-MM) for count metrics", async () => {
    dbMock.usageRecord.upsert.mockResolvedValue({ count: 1 });

    await incrementUsage("org_1", "workflow_runs");

    const call = dbMock.usageRecord.upsert.mock.calls[0]![0];
    expect(call.where.organizationId_metric_period.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it("uses daily period (YYYY-MM-DD) for llm_spend_cents", async () => {
    dbMock.usageRecord.upsert.mockResolvedValue({ count: 100 });

    await incrementUsage("org_1", "llm_spend_cents");

    const call = dbMock.usageRecord.upsert.mock.calls[0]![0];
    expect(call.where.organizationId_metric_period.period).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("accepts custom period override", async () => {
    dbMock.usageRecord.upsert.mockResolvedValue({ count: 1 });

    await incrementUsage("org_1", "accounts", "2026-01");

    const call = dbMock.usageRecord.upsert.mock.calls[0]![0];
    expect(call.where.organizationId_metric_period.period).toBe("2026-01");
  });
});

describe("checkUsageLimit", () => {
  it("delegates llm_spend_cents to checkLlmBudget", async () => {
    mockCheckLlmBudget.mockResolvedValue({
      allowed: true,
      spentCents: 100,
      budgetCents: 500,
      message: undefined,
    });

    const result = await checkUsageLimit("org_1", "llm_spend_cents");

    expect(mockCheckLlmBudget).toHaveBeenCalledWith("org_1");
    expect(result).toEqual({
      allowed: true,
      current: 100,
      limit: 500,
      message: undefined,
    });
  });

  it("allows when current < limit", async () => {
    dbMock.usageRecord.findUnique.mockResolvedValue({ count: 2 });
    dbMock.organization.findUnique.mockResolvedValue({ maxAccounts: 3 });

    const result = await checkUsageLimit("org_1", "accounts");

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(2);
    expect(result.limit).toBe(3);
  });

  it("denies when current >= limit", async () => {
    dbMock.usageRecord.findUnique.mockResolvedValue({ count: 50 });
    dbMock.organization.findUnique.mockResolvedValue({ maxWorkflowRuns: 50 });

    const result = await checkUsageLimit("org_1", "workflow_runs");

    expect(result.allowed).toBe(false);
    expect(result.message).toContain("limit reached");
  });

  it("treats missing usage record as 0", async () => {
    dbMock.usageRecord.findUnique.mockResolvedValue(null);
    dbMock.organization.findUnique.mockResolvedValue({ maxVideosPerMonth: 30 });

    const result = await checkUsageLimit("org_1", "videos");

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
  });

  it("treats missing org as 0 limit", async () => {
    dbMock.usageRecord.findUnique.mockResolvedValue({ count: 1 });
    dbMock.organization.findUnique.mockResolvedValue(null);

    const result = await checkUsageLimit("org_1", "accounts");

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(0);
  });

  it("maps metric to correct org gate field", async () => {
    dbMock.usageRecord.findUnique.mockResolvedValue(null);
    dbMock.organization.findUnique.mockResolvedValue({ maxAccounts: 10 });

    await checkUsageLimit("org_1", "accounts");

    expect(dbMock.organization.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { maxAccounts: true },
      }),
    );
  });
});
