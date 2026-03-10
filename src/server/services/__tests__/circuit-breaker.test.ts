import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Mock Redis ──────────────────────────────────────────────────
const redisMock = {
  exists: vi.fn(),
  ttl: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  publish: vi.fn(),
};

vi.mock("ioredis", () => ({
  Redis: class {
    exists = redisMock.exists;
    ttl = redisMock.ttl;
    set = redisMock.set;
    get = redisMock.get;
    del = redisMock.del;
    publish = redisMock.publish;
  },
}));

// ── Mock Prisma ─────────────────────────────────────────────────
const dbMock = {
  orgPlatformToken: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

let canPost: typeof import("../circuit-breaker.js")["canPost"];
let recordSuccess: typeof import("../circuit-breaker.js")["recordSuccess"];
let recordFailure: typeof import("../circuit-breaker.js")["recordFailure"];

beforeAll(async () => {
  const mod = await import("../circuit-breaker.js");
  canPost = mod.canPost;
  recordSuccess = mod.recordSuccess;
  recordFailure = mod.recordFailure;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canPost", () => {
  it("returns not allowed when account not found", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue(null);
    const result = await canPost("acc_1");
    expect(result).toEqual({ allowed: false, reason: "Account not found" });
  });

  it("allows posting when circuit is CLOSED", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      circuitState: "CLOSED",
      healthScore: 1.0,
    });
    const result = await canPost("acc_1");
    expect(result.allowed).toBe(true);
  });

  it("denies posting when circuit OPEN and cooldown active", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      circuitState: "OPEN",
      healthScore: 0.5,
    });
    redisMock.exists.mockResolvedValue(1);
    redisMock.ttl.mockResolvedValue(120);

    const result = await canPost("acc_1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("cooldown");
  });

  it("transitions OPEN → HALF_OPEN when cooldown expired", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      circuitState: "OPEN",
      healthScore: 0.5,
    });
    redisMock.exists.mockResolvedValue(0);
    dbMock.orgPlatformToken.update.mockResolvedValue({});

    const result = await canPost("acc_1");
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("HALF_OPEN");
    expect(dbMock.orgPlatformToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { circuitState: "HALF_OPEN" },
      }),
    );
  });

  it("allows trial request in HALF_OPEN state", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      circuitState: "HALF_OPEN",
      healthScore: 0.5,
    });
    const result = await canPost("acc_1");
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("HALF_OPEN");
  });
});

describe("recordSuccess", () => {
  it("does nothing when account not found", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue(null);
    await recordSuccess("acc_1");
    expect(dbMock.orgPlatformToken.update).not.toHaveBeenCalled();
  });

  it("resets failures and transitions to CLOSED", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({ healthScore: 0.8 });
    dbMock.orgPlatformToken.update.mockResolvedValue({});

    await recordSuccess("acc_1");

    expect(dbMock.orgPlatformToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consecutiveFailures: 0,
          circuitState: "CLOSED",
          healthScore: 0.9, // 0.8 + 0.1
        }),
      }),
    );
  });

  it("caps health at 1.0", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({ healthScore: 0.95 });
    dbMock.orgPlatformToken.update.mockResolvedValue({});

    await recordSuccess("acc_1");

    expect(dbMock.orgPlatformToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ healthScore: 1.0 }),
      }),
    );
  });

  it("clears backoff and cooldown keys from Redis", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({ healthScore: 0.5 });
    dbMock.orgPlatformToken.update.mockResolvedValue({});

    await recordSuccess("acc_1");

    expect(redisMock.del).toHaveBeenCalledWith("circuit:backoff:acc_1");
    expect(redisMock.del).toHaveBeenCalledWith("circuit:cooldown:acc_1");
  });
});

describe("recordFailure", () => {
  it("does nothing when account not found", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue(null);
    await recordFailure("acc_1");
    expect(dbMock.orgPlatformToken.update).not.toHaveBeenCalled();
  });

  it("increments failures and decays health", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      consecutiveFailures: 0,
      circuitState: "CLOSED",
      healthScore: 1.0,
      organizationId: "org_1",
      accountLabel: "test",
      platform: "YOUTUBE",
    });
    dbMock.orgPlatformToken.update.mockResolvedValue({});

    await recordFailure("acc_1");

    expect(dbMock.orgPlatformToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consecutiveFailures: 1,
          healthScore: 0.85, // 1.0 - 0.15
          circuitState: "CLOSED", // still closed, only 1 failure
        }),
      }),
    );
  });

  it("opens circuit at 3 failures threshold", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      consecutiveFailures: 2,
      circuitState: "CLOSED",
      healthScore: 0.7,
      organizationId: "org_1",
      accountLabel: "test",
      platform: "YOUTUBE",
    });
    dbMock.orgPlatformToken.update.mockResolvedValue({});
    redisMock.get.mockResolvedValue(null);

    await recordFailure("acc_1");

    expect(dbMock.orgPlatformToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          circuitState: "OPEN",
        }),
      }),
    );
    // Should set cooldown
    expect(redisMock.set).toHaveBeenCalledWith(
      "circuit:cooldown:acc_1",
      "1",
      "EX",
      300, // 5 min base cooldown
    );
  });

  it("HALF_OPEN failure returns to OPEN with escalated backoff", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      consecutiveFailures: 3,
      circuitState: "HALF_OPEN",
      healthScore: 0.5,
      organizationId: "org_1",
      accountLabel: "test",
      platform: "YOUTUBE",
    });
    dbMock.orgPlatformToken.update.mockResolvedValue({});
    redisMock.get.mockResolvedValue("1"); // backoff level 1

    await recordFailure("acc_1");

    expect(dbMock.orgPlatformToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ circuitState: "OPEN" }),
      }),
    );
    // Cooldown = 300 * 3^1 = 900s (15 min)
    expect(redisMock.set).toHaveBeenCalledWith(
      "circuit:cooldown:acc_1",
      "1",
      "EX",
      900,
    );
  });

  it("exponential backoff: level 2 = 45 min", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      consecutiveFailures: 2,
      circuitState: "CLOSED",
      healthScore: 0.7,
      organizationId: "org_1",
      accountLabel: "test",
      platform: "YOUTUBE",
    });
    dbMock.orgPlatformToken.update.mockResolvedValue({});
    redisMock.get.mockResolvedValue("2"); // backoff level 2

    await recordFailure("acc_1");

    // Cooldown = 300 * 3^2 = 2700s (45 min)
    expect(redisMock.set).toHaveBeenCalledWith(
      "circuit:cooldown:acc_1",
      "1",
      "EX",
      2700,
    );
  });

  it("floors health at 0", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      consecutiveFailures: 0,
      circuitState: "CLOSED",
      healthScore: 0.1,
      organizationId: "org_1",
      accountLabel: "test",
      platform: "YOUTUBE",
    });
    dbMock.orgPlatformToken.update.mockResolvedValue({});

    await recordFailure("acc_1");

    expect(dbMock.orgPlatformToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ healthScore: 0 }),
      }),
    );
  });

  it("emits admin alert when health drops below 0.3", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      consecutiveFailures: 0,
      circuitState: "CLOSED",
      healthScore: 0.2,
      organizationId: "org_1",
      accountLabel: "test-acct",
      platform: "YOUTUBE",
    });
    dbMock.orgPlatformToken.update.mockResolvedValue({});

    await recordFailure("acc_1");

    expect(redisMock.publish).toHaveBeenCalledWith(
      "admin:alerts",
      expect.stringContaining("circuit_breaker:auto_disable"),
    );
  });
});
