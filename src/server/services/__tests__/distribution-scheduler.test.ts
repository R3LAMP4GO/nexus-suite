import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Mock circuit breaker ────────────────────────────────────────
vi.mock("../circuit-breaker", () => ({
  canPost: vi.fn().mockResolvedValue({ allowed: true }),
}));

// ── Mock pg-boss ────────────────────────────────────────────────
const bossMock = {
  start: vi.fn(),
  send: vi.fn(),
};

vi.mock("pg-boss", () => ({
  default: class {
    start = bossMock.start;
    send = bossMock.send;
  },
}));

vi.mock("@/lib/pg-boss", () => ({
  getBoss: vi.fn(async () => bossMock),
  createBoss: vi.fn(() => bossMock),
  stopBoss: vi.fn(),
}));

// ── Mock Prisma ─────────────────────────────────────────────────
const dbMock = {
  organization: { findUnique: vi.fn() },
  orgPlatformToken: { findMany: vi.fn() },
  postRecord: {
    groupBy: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

let scheduleDistribution: typeof import("../distribution-scheduler.js")["scheduleDistribution"];

beforeAll(async () => {
  const mod = await import("../distribution-scheduler.js");
  scheduleDistribution = mod.scheduleDistribution;
});

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.organization.findUnique.mockResolvedValue({ brandConfig: null });
  dbMock.postRecord.groupBy.mockResolvedValue([]);
  dbMock.postRecord.create.mockImplementation(async ({ data }) => ({
    id: `post_${Date.now()}`,
    ...data,
  }));
});

describe("scheduleDistribution", () => {
  it("sorts accounts by healthScore DESC", async () => {
    dbMock.orgPlatformToken.findMany.mockResolvedValue([
      { id: "a1", platform: "TIKTOK", healthScore: 0.9 },
      { id: "a2", platform: "TIKTOK", healthScore: 0.5 },
    ]);

    await scheduleDistribution("org_1", "var_1", ["TIKTOK"]);

    expect(dbMock.orgPlatformToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { healthScore: "desc" },
        where: expect.objectContaining({
          circuitState: { not: "OPEN" },
        }),
      }),
    );
  });

  it("filters out OPEN circuit accounts via query", async () => {
    dbMock.orgPlatformToken.findMany.mockResolvedValue([]);

    await scheduleDistribution("org_1", "var_1", ["YOUTUBE"]);

    expect(dbMock.orgPlatformToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          circuitState: { not: "OPEN" },
        }),
      }),
    );
  });

  it("respects default daily caps — TikTok:3", async () => {
    dbMock.orgPlatformToken.findMany.mockResolvedValue([
      { id: "a1", platform: "TIKTOK", healthScore: 0.9 },
    ]);
    // Account already posted 3 times today
    dbMock.postRecord.groupBy.mockResolvedValue([
      { accountId: "a1", _count: { id: 3 } },
    ]);

    const result = await scheduleDistribution("org_1", "var_1", ["TIKTOK"]);

    expect(result.scheduled).toBe(0);
    expect(dbMock.postRecord.create).not.toHaveBeenCalled();
  });

  it("creates PostRecord and enqueues pg-boss job", async () => {
    // Force skip probability to never skip
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    dbMock.orgPlatformToken.findMany.mockResolvedValue([
      { id: "a1", platform: "YOUTUBE", healthScore: 0.9 },
    ]);

    const result = await scheduleDistribution("org_1", "var_1", ["YOUTUBE"]);

    expect(result.scheduled).toBe(1);
    expect(dbMock.postRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          accountId: "a1",
          variationId: "var_1",
          platform: "YOUTUBE",
          status: "SCHEDULED",
        }),
      }),
    );
    expect(bossMock.send).toHaveBeenCalledWith(
      "post:task",
      expect.objectContaining({
        orgId: "org_1",
        accountId: "a1",
        variationId: "var_1",
        platform: "YOUTUBE",
      }),
      expect.objectContaining({ startAfter: expect.any(Date) }),
    );

    vi.spyOn(Math, "random").mockRestore();
  });

  it("10% skip probability creates skipped entry", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05); // < 0.1 → skip

    dbMock.orgPlatformToken.findMany.mockResolvedValue([
      { id: "a1", platform: "YOUTUBE", healthScore: 0.9 },
    ]);

    const result = await scheduleDistribution("org_1", "var_1", ["YOUTUBE"]);

    expect(result.skipped).toBe(1);
    expect(result.details[0]?.skippedByProbability).toBe(true);
    expect(dbMock.postRecord.create).not.toHaveBeenCalled();

    vi.spyOn(Math, "random").mockRestore();
  });

  it("uses org brandConfig daily cap overrides", async () => {
    dbMock.organization.findUnique.mockResolvedValue({
      brandConfig: { dailyCaps: { TIKTOK: 10 } },
    });
    dbMock.orgPlatformToken.findMany.mockResolvedValue([
      { id: "a1", platform: "TIKTOK", healthScore: 0.9 },
    ]);
    // Already posted 5 times — would be blocked by default cap (3) but not override (10)
    dbMock.postRecord.groupBy.mockResolvedValue([
      { accountId: "a1", _count: { id: 5 } },
    ]);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = await scheduleDistribution("org_1", "var_1", ["TIKTOK"]);

    expect(result.scheduled).toBe(1);

    vi.spyOn(Math, "random").mockRestore();
  });

  it("handles empty accounts list", async () => {
    dbMock.orgPlatformToken.findMany.mockResolvedValue([]);

    const result = await scheduleDistribution("org_1", "var_1", ["YOUTUBE"]);

    expect(result.scheduled).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.details).toEqual([]);
  });
});
