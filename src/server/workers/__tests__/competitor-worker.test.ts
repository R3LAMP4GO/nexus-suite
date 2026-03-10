import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Mock pg-boss ────────────────────────────────────────────────
const bossMock = {
  start: vi.fn(),
  send: vi.fn(),
  work: vi.fn(),
  stop: vi.fn(),
};

vi.mock("pg-boss", () => ({
  default: class {
    start = bossMock.start;
    send = bossMock.send;
    work = bossMock.work;
    stop = bossMock.stop;
  },
}));

// ── Mock Prisma ─────────────────────────────────────────────────
const dbMock = {
  trackedPost: {
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

// ── Mock agents ─────────────────────────────────────────────────
const mockViralTeardown = vi.fn();
const mockScriptAgent = vi.fn();
const mockCaptionWriter = vi.fn();
const mockVariationOrchestrator = vi.fn();

vi.mock("@/agents/specialists/viral-teardown-agent", () => ({
  generate: (...args: unknown[]) => mockViralTeardown(...args),
}));
vi.mock("@/agents/specialists/script-agent", () => ({
  generate: (...args: unknown[]) => mockScriptAgent(...args),
}));
vi.mock("@/agents/specialists/caption-writer", () => ({
  generate: (...args: unknown[]) => mockCaptionWriter(...args),
}));
vi.mock("@/agents/specialists/variation-orchestrator", () => ({
  generate: (...args: unknown[]) => mockVariationOrchestrator(...args),
}));

// ── Mock media queue ────────────────────────────────────────────
const mockSendMediaJob = vi.fn();
vi.mock("@/server/services/media-queue", () => ({
  sendMediaJob: (...args: unknown[]) => mockSendMediaJob(...args),
}));

let startCompetitorWorker: typeof import("../competitor-worker.js")["startCompetitorWorker"];
let stopCompetitorWorker: typeof import("../competitor-worker.js")["stopCompetitorWorker"];

beforeAll(async () => {
  const mod = await import("../competitor-worker.js");
  startCompetitorWorker = mod.startCompetitorWorker;
  stopCompetitorWorker = mod.stopCompetitorWorker;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function getCompetitorHandler() {
  // work is called twice: once for scrape:result listener, once for competitor:task
  const call = bossMock.work.mock.calls.find(
    (c: unknown[]) => c[0] === "competitor:task",
  );
  return call?.[2];
}

describe("startCompetitorWorker", () => {
  it("registers worker on competitor:task queue", async () => {
    await startCompetitorWorker();
    expect(bossMock.work).toHaveBeenCalledWith(
      "competitor:task",
      expect.objectContaining({ batchSize: 1 }),
      expect.any(Function),
    );
  });
});

describe("stopCompetitorWorker", () => {
  it("calls boss.stop", async () => {
    await startCompetitorWorker(); // sets boss instance
    await stopCompetitorWorker();
    expect(bossMock.stop).toHaveBeenCalled();
  });
});

describe("reproduce pipeline", () => {
  it("throws when post not analyzed yet", async () => {
    dbMock.trackedPost.findUniqueOrThrow.mockResolvedValue({
      analysis: null,
      analyzedAt: null,
    });

    await startCompetitorWorker();
    const handler = getCompetitorHandler();

    const job = {
      data: {
        jobType: "reproduce",
        postId: "post_1",
        url: "https://example.com",
        organizationId: "org_1",
      },
    };

    await expect(handler([job])).rejects.toThrow("not analyzed yet");
  });

  it("runs full reproduce pipeline: script → caption → variation → media", async () => {
    dbMock.trackedPost.findUniqueOrThrow.mockResolvedValue({
      analysis: { hooks: ["hook1"] },
      analyzedAt: new Date(),
    });
    mockScriptAgent.mockResolvedValue({ text: "script text" });
    mockCaptionWriter.mockResolvedValue({ text: "caption text" });
    mockVariationOrchestrator.mockResolvedValue({ text: '{"transform":"scale"}' });
    dbMock.trackedPost.update.mockResolvedValue({});

    await startCompetitorWorker();
    const handler = getCompetitorHandler();

    await handler([{
      data: {
        jobType: "reproduce",
        postId: "post_1",
        url: "https://example.com/v1",
        organizationId: "org_1",
      },
    }]);

    expect(mockScriptAgent).toHaveBeenCalled();
    expect(mockCaptionWriter).toHaveBeenCalled();
    expect(mockVariationOrchestrator).toHaveBeenCalled();
    expect(mockSendMediaJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "transform",
        organizationId: "org_1",
      }),
    );
    expect(dbMock.trackedPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reproduced: true },
      }),
    );
  });
});
