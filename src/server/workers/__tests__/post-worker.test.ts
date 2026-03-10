import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Mock pg-boss ────────────────────────────────────────────────
const bossMock = {
  start: vi.fn(),
  work: vi.fn(),
  stop: vi.fn(),
};

vi.mock("pg-boss", () => ({
  default: class {
    start = bossMock.start;
    work = bossMock.work;
    stop = bossMock.stop;
  },
}));

// ── Mock Prisma ─────────────────────────────────────────────────
const dbMock = {
  postRecord: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

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
  it("registers with batchSize 2", async () => {
    await startPostWorker();
    expect(bossMock.work).toHaveBeenCalledWith(
      "post:task",
      { batchSize: 2 },
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
