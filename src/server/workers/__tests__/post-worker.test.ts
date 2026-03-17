import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Mock pg-boss (mock the wrapper, not the library) ────────────
const bossMock = {
  start: vi.fn(),
  work: vi.fn(),
  stop: vi.fn(),
};

vi.mock("pg-boss", () => ({
  PgBoss: class {
    start = bossMock.start;
    work = bossMock.work;
    stop = bossMock.stop;
  },
}));

vi.mock("@/lib/pg-boss", () => ({
  getBoss: vi.fn(async () => bossMock),
  createBoss: vi.fn(() => bossMock),
  stopBoss: vi.fn(),
}));

// ── Mock Prisma ─────────────────────────────────────────────────
const dbMock = {
  postRecord: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  orgPlatformToken: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

// ── Mock circuit breaker ────────────────────────────────────────
const mockCanPost = vi.fn().mockResolvedValue({ allowed: true });
vi.mock("@/server/services/circuit-breaker", () => ({
  canPost: (...args: unknown[]) => mockCanPost(...args),
}));

// ── Mock SSE broadcaster ────────────────────────────────────────
vi.mock("@/server/services/sse-broadcaster", () => ({
  publishSSE: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock metrics ────────────────────────────────────────────────
vi.mock("@/lib/metrics", () => ({
  incCounter: vi.fn().mockResolvedValue(undefined),
  observeHistogram: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock posting service ────────────────────────────────────────
const mockPostContent = vi.fn();
vi.mock("@/server/services/posting", () => ({
  postContent: (...args: unknown[]) => mockPostContent(...args),
}));

let startPostWorker: typeof import("../post-worker.js")["startPostWorker"];

beforeAll(async () => {
  const mod = await import("../post-worker.js");
  startPostWorker = mod.startPostWorker;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startPostWorker", () => {
  it("registers with batchSize 1", async () => {
    await startPostWorker();
    expect(bossMock.work).toHaveBeenCalledWith(
      "post:task",
      { batchSize: 1 },
      expect.any(Function),
    );
  });
});

describe("post task handler", () => {
  async function getHandler() {
    await startPostWorker();
    return bossMock.work.mock.calls[0]![2];
  }

  const job = {
    data: {
      orgId: "org_1",
      accountId: "acc_1",
      variationId: "var_1",
      platform: "YOUTUBE",
      postRecordId: "pr_1",
    },
  };

  it("skips when postRecord not found", async () => {
    const handler = await getHandler();
    dbMock.postRecord.findUnique.mockResolvedValue(null);

    await handler([job]);

    expect(mockPostContent).not.toHaveBeenCalled();
  });

  it("skips when postRecord status is not SCHEDULED", async () => {
    const handler = await getHandler();
    dbMock.postRecord.findUnique.mockResolvedValue({ status: "SUCCESS" });

    await handler([job]);

    expect(mockPostContent).not.toHaveBeenCalled();
  });

  it("calls postContent when status is SCHEDULED", async () => {
    const handler = await getHandler();
    dbMock.postRecord.findUnique.mockResolvedValue({ status: "SCHEDULED" });

    await handler([job]);

    expect(mockPostContent).toHaveBeenCalledWith(
      "org_1", "acc_1", "var_1", "YOUTUBE", "pr_1",
    );
  });

  it("skips POSTING status", async () => {
    const handler = await getHandler();
    dbMock.postRecord.findUnique.mockResolvedValue({ status: "POSTING" });

    await handler([job]);

    expect(mockPostContent).not.toHaveBeenCalled();
  });

  it("skips FAILED status", async () => {
    const handler = await getHandler();
    dbMock.postRecord.findUnique.mockResolvedValue({ status: "FAILED" });

    await handler([job]);

    expect(mockPostContent).not.toHaveBeenCalled();
  });
});
