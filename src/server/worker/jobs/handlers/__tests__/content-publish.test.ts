import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  sourceVideo: {
    findUnique: vi.fn(),
  },
  orgPlatformToken: {
    findMany: vi.fn(),
  },
  postRecord: {
    create: vi.fn(),
  },
}));

const postContentMock = vi.hoisted(() => vi.fn());
const canPostMock = vi.hoisted(() => vi.fn());
const publishSSEMock = vi.hoisted(() => vi.fn());
const incCounterMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/metrics", () => ({ incCounter: incCounterMock }));
vi.mock("@/server/services/posting", () => ({ postContent: postContentMock }));
vi.mock("@/server/services/circuit-breaker", () => ({ canPost: canPostMock }));
vi.mock("@/server/services/sse-broadcaster", () => ({ publishSSE: publishSSEMock }));

import { handleContentPublish } from "../content-publish";

function makeJob(data: Record<string, unknown>) {
  return { id: "job_1", name: "content:publish", data } as any;
}

describe("handleContentPublish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    incCounterMock.mockResolvedValue(undefined);
    publishSSEMock.mockResolvedValue(undefined);
  });

  it("exits early when source video not found", async () => {
    dbMock.sourceVideo.findUnique.mockResolvedValue(null);
    await handleContentPublish(makeJob({
      contentId: "sv_1",
      platformIds: ["YOUTUBE"],
      organizationId: "org_1",
    }));
    expect(postContentMock).not.toHaveBeenCalled();
  });

  it("exits early when no ready variations", async () => {
    dbMock.sourceVideo.findUnique.mockResolvedValue({
      id: "sv_1",
      variations: [],
    });
    await handleContentPublish(makeJob({
      contentId: "sv_1",
      platformIds: ["YOUTUBE"],
      organizationId: "org_1",
    }));
    expect(postContentMock).not.toHaveBeenCalled();
  });

  it("exits early when no eligible accounts", async () => {
    dbMock.sourceVideo.findUnique.mockResolvedValue({
      id: "sv_1",
      variations: [{ id: "var_1" }],
    });
    dbMock.orgPlatformToken.findMany.mockResolvedValue([]);
    await handleContentPublish(makeJob({
      contentId: "sv_1",
      platformIds: ["YOUTUBE"],
      organizationId: "org_1",
    }));
    expect(postContentMock).not.toHaveBeenCalled();
  });

  it("skips account when circuit breaker blocks", async () => {
    dbMock.sourceVideo.findUnique.mockResolvedValue({
      id: "sv_1",
      variations: [{ id: "var_1" }],
    });
    dbMock.orgPlatformToken.findMany.mockResolvedValue([
      { id: "acc_1", platform: "YOUTUBE" },
    ]);
    canPostMock.mockResolvedValue({ allowed: false, reason: "circuit open" });

    await handleContentPublish(makeJob({
      contentId: "sv_1",
      platformIds: ["YOUTUBE"],
      organizationId: "org_1",
    }));
    expect(postContentMock).not.toHaveBeenCalled();
  });

  it("posts content when all checks pass", async () => {
    dbMock.sourceVideo.findUnique.mockResolvedValue({
      id: "sv_1",
      variations: [{ id: "var_1" }],
    });
    dbMock.orgPlatformToken.findMany.mockResolvedValue([
      { id: "acc_1", platform: "YOUTUBE" },
    ]);
    canPostMock.mockResolvedValue({ allowed: true });
    dbMock.postRecord.create.mockResolvedValue({ id: "pr_1" });
    postContentMock.mockResolvedValue({ success: true });

    await handleContentPublish(makeJob({
      contentId: "sv_1",
      platformIds: ["YOUTUBE"],
      organizationId: "org_1",
    }));
    expect(postContentMock).toHaveBeenCalledWith(
      "org_1", "acc_1", "var_1", "YOUTUBE", "pr_1",
    );
  });

  it("publishes SSE event after completion", async () => {
    dbMock.sourceVideo.findUnique.mockResolvedValue({
      id: "sv_1",
      variations: [{ id: "var_1" }],
    });
    dbMock.orgPlatformToken.findMany.mockResolvedValue([
      { id: "acc_1", platform: "YOUTUBE" },
    ]);
    canPostMock.mockResolvedValue({ allowed: true });
    dbMock.postRecord.create.mockResolvedValue({ id: "pr_1" });
    postContentMock.mockResolvedValue({ success: true });

    await handleContentPublish(makeJob({
      contentId: "sv_1",
      platformIds: ["YOUTUBE"],
      organizationId: "org_1",
    }));
    expect(publishSSEMock).toHaveBeenCalledWith(
      "org_1",
      "content:published",
      expect.objectContaining({ contentId: "sv_1" }),
    );
  });
});
