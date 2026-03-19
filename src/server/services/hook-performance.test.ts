import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    postRecord: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    postMetricSnapshot: {
      create: vi.fn(),
    },
    hookPerformance: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: dbMock,
}));

import { collectMetrics, updatePostMetrics, sampleTopHooks, getFrameworkStats } from "./hook-performance";

describe("collectMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes recent SUCCESS posts", async () => {
    dbMock.postRecord.findMany.mockResolvedValue([
      {
        id: "post_1",
        platform: "YOUTUBE",
        externalPostId: "ext_1",
        postedAt: new Date(),
        variation: { sourceVideo: { script: { hookText: "Test hook" } } },
        metricSnapshots: [],
      },
    ]);
    dbMock.postMetricSnapshot.create.mockResolvedValue({ id: "snap_1" });
    dbMock.hookPerformance.findUnique.mockResolvedValue(null);
    dbMock.hookPerformance.create.mockResolvedValue({});

    const result = await collectMetrics("org_1");
    expect(result.postsProcessed).toBe(1);
    expect(result.snapshotsCreated).toBe(1);
    expect(result.hooksUpdated).toBe(1);
  });

  it("skips recently snapshotted posts", async () => {
    dbMock.postRecord.findMany.mockResolvedValue([
      {
        id: "post_1",
        platform: "YOUTUBE",
        externalPostId: "ext_1",
        postedAt: new Date(),
        variation: { sourceVideo: { script: { hookText: "Test hook" } } },
        metricSnapshots: [{ snapshotAt: new Date() }], // recent snapshot
      },
    ]);

    const result = await collectMetrics("org_1");
    expect(result.snapshotsCreated).toBe(0);
  });

  it("returns zero counts for no posts", async () => {
    dbMock.postRecord.findMany.mockResolvedValue([]);
    const result = await collectMetrics("org_1");
    expect(result.postsProcessed).toBe(0);
    expect(result.snapshotsCreated).toBe(0);
    expect(result.hooksUpdated).toBe(0);
  });
});

describe("updatePostMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a metric snapshot with engagement rate", async () => {
    dbMock.postMetricSnapshot.create.mockResolvedValue({});
    dbMock.postRecord.findUnique.mockResolvedValue({
      organizationId: "org_1",
      platform: "YOUTUBE",
      variation: { sourceVideo: { script: { hookText: "hook" } } },
    });
    dbMock.hookPerformance.findUnique.mockResolvedValue(null);
    dbMock.hookPerformance.create.mockResolvedValue({});

    await updatePostMetrics("post_1", {
      views: 1000,
      likes: 50,
      comments: 10,
      shares: 5,
    });

    expect(dbMock.postMetricSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          views: 1000,
          likes: 50,
          engagementRate: expect.any(Number),
        }),
      }),
    );
  });

  it("calculates engagement rate correctly", async () => {
    dbMock.postMetricSnapshot.create.mockResolvedValue({});
    dbMock.postRecord.findUnique.mockResolvedValue(null);

    await updatePostMetrics("post_1", {
      views: 1000,
      likes: 50,
      comments: 10,
    });

    const call = dbMock.postMetricSnapshot.create.mock.calls[0][0];
    // (50 + 10 + 0) / 1000 = 0.06 → Math.round(0.06 * 10000) / 10000 = 0.06
    expect(call.data.engagementRate).toBe(0.06);
  });

  it("handles zero views without division error", async () => {
    dbMock.postMetricSnapshot.create.mockResolvedValue({});
    dbMock.postRecord.findUnique.mockResolvedValue(null);

    await updatePostMetrics("post_1", {
      views: 0,
      likes: 0,
      comments: 0,
    });

    const call = dbMock.postMetricSnapshot.create.mock.calls[0][0];
    expect(call.data.engagementRate).toBe(0);
  });
});

describe("sampleTopHooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns hooks ranked by sampled score", async () => {
    dbMock.hookPerformance.findMany.mockResolvedValue([
      {
        hookText: "Hook 1",
        hookFramework: "question",
        platform: "YOUTUBE",
        score: 0.8,
        alphaPrior: 10,
        betaPrior: 2,
        timesUsed: 12,
        avgEngagement: 0.05,
        avgRetention: 0.65,
      },
      {
        hookText: "Hook 2",
        hookFramework: "statistic",
        platform: "YOUTUBE",
        score: 0.3,
        alphaPrior: 2,
        betaPrior: 8,
        timesUsed: 3,
        avgEngagement: 0.01,
        avgRetention: null,
      },
    ]);

    const result = await sampleTopHooks("org_1");
    expect(result.length).toBe(2);
    // Each should have a sampledScore
    for (const hook of result) {
      expect(hook.sampledScore).toBeGreaterThanOrEqual(0);
      expect(hook.sampledScore).toBeLessThanOrEqual(1);
    }
  });

  it("assigns confidence levels based on timesUsed", async () => {
    dbMock.hookPerformance.findMany.mockResolvedValue([
      { hookText: "H1", hookFramework: null, platform: "YOUTUBE", score: 0.5, alphaPrior: 5, betaPrior: 5, timesUsed: 15, avgEngagement: 0.03, avgRetention: null },
      { hookText: "H2", hookFramework: null, platform: "YOUTUBE", score: 0.5, alphaPrior: 3, betaPrior: 3, timesUsed: 5, avgEngagement: 0.03, avgRetention: null },
      { hookText: "H3", hookFramework: null, platform: "YOUTUBE", score: 0.5, alphaPrior: 1, betaPrior: 1, timesUsed: 1, avgEngagement: 0.03, avgRetention: null },
    ]);

    const result = await sampleTopHooks("org_1");
    const confidences = result.map((r) => r.confidence);
    expect(confidences).toContain("high");
    expect(confidences).toContain("medium");
    expect(confidences).toContain("low");
  });

  it("respects limit parameter", async () => {
    dbMock.hookPerformance.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        hookText: `Hook ${i}`,
        hookFramework: null,
        platform: "YOUTUBE",
        score: 0.5,
        alphaPrior: 1,
        betaPrior: 1,
        timesUsed: 1,
        avgEngagement: 0.03,
        avgRetention: null,
      })),
    );

    const result = await sampleTopHooks("org_1", undefined, 5);
    expect(result.length).toBe(5);
  });
});

describe("getFrameworkStats", () => {
  it("returns aggregated stats by framework", async () => {
    dbMock.hookPerformance.groupBy.mockResolvedValue([
      {
        hookFramework: "question",
        _count: { id: 5 },
        _avg: { avgEngagement: 0.045, score: 0.7 },
        _sum: { totalViews: 50000 },
      },
    ]);

    const result = await getFrameworkStats("org_1");
    expect(result[0].framework).toBe("question");
    expect(result[0].count).toBe(5);
    expect(result[0].totalViews).toBe(50000);
  });
});
