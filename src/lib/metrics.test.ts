import { describe, it, expect, vi, beforeEach } from "vitest";

const { pipelineMock, redisMock } = vi.hoisted(() => {
  const pipelineMock = {
    hincrby: vi.fn().mockReturnThis(),
    hincrbyfloat: vi.fn().mockReturnThis(),
    exec: vi.fn(async () => []),
  };
  const redisMock = {
    incrby: vi.fn(),
    pipeline: vi.fn(() => pipelineMock),
    scanStream: vi.fn(),
    mget: vi.fn(),
    hgetall: vi.fn(),
  };
  return { pipelineMock, redisMock };
});

vi.mock("@/lib/redis", () => ({
  redis: redisMock,
}));

import { incCounter, getCounter, observeHistogram, getHistogram } from "./metrics";

describe("incCounter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("increments counter with serialized labels", async () => {
    await incCounter("requests", { method: "GET", path: "/api" });
    expect(redisMock.incrby).toHaveBeenCalledWith(
      "metrics:counter:requests:method=GET,path=/api",
      1,
    );
  });

  it("increments by custom delta", async () => {
    await incCounter("requests", { method: "POST" }, 5);
    expect(redisMock.incrby).toHaveBeenCalledWith(
      "metrics:counter:requests:method=POST",
      5,
    );
  });

  it("sorts labels alphabetically", async () => {
    await incCounter("test", { z: "1", a: "2" });
    expect(redisMock.incrby).toHaveBeenCalledWith(
      "metrics:counter:test:a=2,z=1",
      1,
    );
  });
});

describe("observeHistogram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.pipeline.mockReturnValue(pipelineMock);
  });

  it("increments appropriate buckets for a given value", async () => {
    await observeHistogram("latency", { endpoint: "/api" }, 0.5);
    // 0.5 should hit buckets: 0.5, 1, 2.5, 5, 10, 30, 60
    expect(pipelineMock.hincrby).toHaveBeenCalledWith(
      expect.stringContaining("histogram:latency:"),
      "le:0.5",
      1,
    );
    expect(pipelineMock.hincrby).toHaveBeenCalledWith(
      expect.stringContaining("histogram:latency:"),
      "le:1",
      1,
    );
    // +Inf always incremented
    expect(pipelineMock.hincrby).toHaveBeenCalledWith(
      expect.stringContaining("histogram:latency:"),
      "le:+Inf",
      1,
    );
    // _count always incremented
    expect(pipelineMock.hincrby).toHaveBeenCalledWith(
      expect.stringContaining("histogram:latency:"),
      "_count",
      1,
    );
    // _sum tracks value
    expect(pipelineMock.hincrbyfloat).toHaveBeenCalledWith(
      expect.stringContaining("histogram:latency:"),
      "_sum",
      0.5,
    );
    expect(pipelineMock.exec).toHaveBeenCalled();
  });

  it("does not increment buckets below the value", async () => {
    await observeHistogram("latency", { endpoint: "/api" }, 5);
    // 5 should NOT hit 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5
    expect(pipelineMock.hincrby).not.toHaveBeenCalledWith(
      expect.any(String),
      "le:0.01",
      1,
    );
    expect(pipelineMock.hincrby).not.toHaveBeenCalledWith(
      expect.any(String),
      "le:2.5",
      1,
    );
  });
});
