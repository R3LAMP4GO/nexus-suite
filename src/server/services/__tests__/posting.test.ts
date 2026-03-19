import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  postRecord: {
    update: vi.fn(),
  },
  orgPlatformToken: {
    findUnique: vi.fn(),
  },
  videoVariation: {
    findUnique: vi.fn(),
  },
}));

const redisMock = vi.hoisted(() => ({
  publish: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  incrby: vi.fn(),
  pipeline: vi.fn(() => ({
    hincrby: vi.fn().mockReturnThis(),
    hincrbyfloat: vi.fn().mockReturnThis(),
    exec: vi.fn(async () => []),
  })),
}));

const circuitMock = vi.hoisted(() => ({
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/redis", () => ({ redis: redisMock }));
vi.mock("@/lib/infisical", () => ({ fetchSecret: vi.fn(async () => "mock-token") }));
vi.mock("@/lib/metrics", () => ({
  incCounter: vi.fn(async () => {}),
  observeHistogram: vi.fn(async () => {}),
}));
vi.mock("@/server/services/circuit-breaker", () => circuitMock);
vi.mock("@/server/services/platform-apis/meta", () => ({
  getMetaAuth: vi.fn(),
  getVideoUrl: vi.fn(),
  isMockMode: vi.fn(() => false),
  mockPostResult: vi.fn(),
}));
vi.mock("@/server/services/browser-helpers", () => ({
  loadAccountContext: vi.fn(),
  launchBrowser: vi.fn(),
  persistSession: vi.fn(),
}));
vi.mock("@/server/services/r2-storage", () => ({
  downloadFile: vi.fn(async () => Buffer.from("video")),
}));
vi.mock("@/server/services/browser-posting", () => ({
  uploadViaPlatform: vi.fn(),
}));
vi.mock("@/server/services/platform-apis/youtube", () => ({
  postYouTubeApi: vi.fn(async () => ({ success: true, externalPostId: "yt_123" })),
}));
vi.mock("@/server/services/platform-apis/tiktok", () => ({
  postTikTokApi: vi.fn(async () => ({ success: true, externalPostId: "tt_123" })),
}));
vi.mock("@/server/services/platform-apis/x", () => ({
  postXApi: vi.fn(async () => ({ success: true, externalPostId: "x_123" })),
}));
vi.mock("@/server/services/platform-apis/linkedin", () => ({
  postLinkedInApi: vi.fn(async () => ({ success: true, externalPostId: "li_123" })),
}));

import { postContent } from "../posting";

describe("postContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.postRecord.update.mockResolvedValue({});
    redisMock.publish.mockResolvedValue(1);
  });

  it("returns error when account not found", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue(null);
    const result = await postContent("org_1", "acc_1", "var_1", "YOUTUBE", "pr_1");
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("Account not found");
  });

  it("returns error when variation not found", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      id: "acc_1",
      accountType: "PRIMARY",
      platform: "YOUTUBE",
      infisicalSecretPath: "/path",
      fingerprintProfile: null,
    });
    dbMock.videoVariation.findUnique.mockResolvedValue(null);
    const result = await postContent("org_1", "acc_1", "var_1", "YOUTUBE", "pr_1");
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("Variation not found");
  });

  it("routes PRIMARY accounts to API posting", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      id: "acc_1",
      accountType: "PRIMARY",
      platform: "YOUTUBE",
      infisicalSecretPath: "/path",
      fingerprintProfile: null,
    });
    dbMock.videoVariation.findUnique.mockResolvedValue({
      id: "var_1",
      r2StorageKey: "videos/test.mp4",
      caption: "Test",
    });

    const result = await postContent("org_1", "acc_1", "var_1", "YOUTUBE", "pr_1");
    expect(result.success).toBe(true);
    expect(result.externalPostId).toBe("yt_123");
  });

  it("updates post record status to POSTING then final status", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      id: "acc_1",
      accountType: "PRIMARY",
      platform: "YOUTUBE",
      infisicalSecretPath: "/path",
      fingerprintProfile: null,
    });
    dbMock.videoVariation.findUnique.mockResolvedValue({
      id: "var_1",
      r2StorageKey: "videos/test.mp4",
      caption: "Test",
    });

    await postContent("org_1", "acc_1", "var_1", "YOUTUBE", "pr_1");

    // First call: POSTING
    expect(dbMock.postRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "POSTING" }),
      }),
    );
    // Second call: SUCCESS
    expect(dbMock.postRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCESS" }),
      }),
    );
  });

  it("records circuit breaker success on successful post", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      id: "acc_1",
      accountType: "PRIMARY",
      platform: "YOUTUBE",
      infisicalSecretPath: "/path",
      fingerprintProfile: null,
    });
    dbMock.videoVariation.findUnique.mockResolvedValue({
      id: "var_1",
      r2StorageKey: "videos/test.mp4",
      caption: "Test",
    });

    await postContent("org_1", "acc_1", "var_1", "YOUTUBE", "pr_1");
    expect(circuitMock.recordSuccess).toHaveBeenCalledWith("acc_1");
  });

  it("publishes SSE event after posting", async () => {
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      id: "acc_1",
      accountType: "PRIMARY",
      platform: "YOUTUBE",
      infisicalSecretPath: "/path",
      fingerprintProfile: null,
    });
    dbMock.videoVariation.findUnique.mockResolvedValue({
      id: "var_1",
      r2StorageKey: "videos/test.mp4",
      caption: "Test",
    });

    await postContent("org_1", "acc_1", "var_1", "YOUTUBE", "pr_1");
    expect(redisMock.publish).toHaveBeenCalledWith(
      "post:events",
      expect.stringContaining("post:success"),
    );
  });

  it("returns mock success when MOCK_PLATFORM_APIS is enabled", async () => {
    process.env.MOCK_PLATFORM_APIS = "true";
    dbMock.orgPlatformToken.findUnique.mockResolvedValue({
      id: "acc_1",
      accountType: "PRIMARY",
      platform: "YOUTUBE",
      infisicalSecretPath: "/path",
      fingerprintProfile: null,
    });
    dbMock.videoVariation.findUnique.mockResolvedValue({
      id: "var_1",
      r2StorageKey: "videos/test.mp4",
      caption: "Test",
    });

    const result = await postContent("org_1", "acc_1", "var_1", "YOUTUBE", "pr_1");
    expect(result.success).toBe(true);
    expect(result.externalPostId).toContain("mock_YOUTUBE");
    delete process.env.MOCK_PLATFORM_APIS;
  });
});
