import { describe, it, expect, vi, beforeEach } from "vitest";

const bossMock = vi.hoisted(() => ({
  send: vi.fn(async () => "job_123"),
}));

vi.mock("@/lib/pg-boss", () => ({
  getBoss: vi.fn(async () => bossMock),
}));

import { sendMediaJob } from "../media-queue";

describe("sendMediaJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends job to media:task queue", async () => {
    const payload = {
      organizationId: "org_1",
      sourceVideoId: "sv_1",
      variationId: "var_1",
      action: "render" as const,
    };
    const jobId = await sendMediaJob(payload as any);
    expect(jobId).toBe("job_123");
    expect(bossMock.send).toHaveBeenCalledWith("media:task", payload, {});
  });

  it("passes options to pg-boss", async () => {
    const payload = { action: "render" } as any;
    const options = { retryLimit: 3, retryDelay: 60 };
    await sendMediaJob(payload, options);
    expect(bossMock.send).toHaveBeenCalledWith("media:task", payload, options);
  });

  it("returns null when boss.send returns null", async () => {
    bossMock.send.mockResolvedValue(null as unknown as string);
    const jobId = await sendMediaJob({ action: "render" } as any);
    expect(jobId).toBeNull();
  });
});
