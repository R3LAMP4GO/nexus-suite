import { describe, it, expect, vi, beforeEach } from "vitest";

const publishMock = vi.hoisted(() => vi.fn());
const subscribeMock = vi.hoisted(() => vi.fn());
const onMock = vi.hoisted(() => vi.fn());
const unsubscribeMock = vi.hoisted(() => vi.fn());
const quitMock = vi.hoisted(() => vi.fn());

vi.mock("ioredis", () => ({
  Redis: class {
    publish = publishMock;
    subscribe = subscribeMock;
    on = onMock;
    unsubscribe = unsubscribeMock;
    quit = quitMock;
  },
}));

import { publishSSE, subscribeSSE } from "../sse-broadcaster";

describe("sse-broadcaster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("publishSSE", () => {
    it("publishes event to correct channel", async () => {
      publishMock.mockResolvedValue(1);
      await publishSSE("org_1", "post_status", { postId: "123" });
      expect(publishMock).toHaveBeenCalledWith(
        "sse:org:org_1",
        expect.stringContaining("post_status"),
      );
    });

    it("includes timestamp in published event", async () => {
      publishMock.mockResolvedValue(1);
      await publishSSE("org_1", "workflow_status", { step: "done" });
      const payload = JSON.parse(publishMock.mock.calls[0][1]);
      expect(payload.timestamp).toBeDefined();
      expect(payload.type).toBe("workflow_status");
      expect(payload.data).toEqual({ step: "done" });
    });
  });

  describe("subscribeSSE", () => {
    it("returns stream and cleanup function", () => {
      const result = subscribeSSE("org_1");
      expect(result.stream).toBeInstanceOf(ReadableStream);
      expect(typeof result.cleanup).toBe("function");
    });

    it("subscribes to org channel", () => {
      subscribeSSE("org_1");
      expect(subscribeMock).toHaveBeenCalledWith("sse:org:org_1");
    });

    it("cleanup unsubscribes and quits", () => {
      const { cleanup } = subscribeSSE("org_1");
      cleanup();
      expect(unsubscribeMock).toHaveBeenCalled();
      expect(quitMock).toHaveBeenCalled();
    });

    it("cleanup is idempotent", () => {
      const { cleanup } = subscribeSSE("org_1");
      cleanup();
      cleanup(); // second call should not throw
      expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    });
  });
});
