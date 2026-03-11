import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkflowDefinition } from "@/server/workflows/workflow-schema";

// Mock agent-delegate and llm-budget (same pattern as existing executor.test.ts)
vi.mock("@/server/workflows/agent-delegate", () => ({
  executeAgentDelegate: vi.fn(async () => ({ result: "agent-output" })),
  getRegisteredAgents: vi.fn(() => new Map()),
  SPECIALIST_AGENTS: new Set([
    "seo-agent", "hook-writer", "title-generator", "thumbnail-creator",
    "script-agent", "caption-writer", "hashtag-optimizer", "thread-writer",
    "article-writer", "trend-scout", "engagement-responder",
    "analytics-reporter", "content-repurposer", "quality-scorer",
    "variation-orchestrator", "brand-persona-agent", "viral-teardown-agent",
  ]),
  PLATFORM_SUBAGENTS: new Set([
    "community-post-formatter", "shorts-optimizer",
    "duet-stitch-logic", "sound-selector",
    "carousel-sequencer", "story-formatter",
    "professional-tone-adapter", "article-formatter",
    "news-scout", "tone-translator", "x-engagement-responder",
  ]),
}));

vi.mock("@/server/services/llm-budget", () => ({
  checkLlmBudget: vi.fn(async () => ({
    allowed: true,
    spentCents: 0,
    budgetCents: 500,
    remainingCents: 500,
    percentUsed: 0,
    message: "OK",
  })),
}));

vi.mock("@/server/services/notifications", () => ({
  sendScriptReadyEmail: vi.fn(async () => ({ success: true })),
  sendVideoProcessedEmail: vi.fn(async () => ({ success: true })),
  sendActivationEmail: vi.fn(async () => ({ success: true })),
  sendWelcomeEmail: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/server/services/usage-tracking", () => ({
  incrementUsage: vi.fn(async () => ({ current: 1, limit: 50 })),
}));

vi.mock("@/lib/db", () => ({
  db: { workflowRunLog: { create: vi.fn(async () => ({})) } },
}));

const { executeWorkflow, registerAction } = await import(
  "@/server/workflows/executor"
);

function validWorkflow(
  overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return {
    name: "test-wf",
    organizationId: "org_1",
    trigger: { type: "manual" },
    steps: [{ id: "s1", type: "action", action: "test.noop" }],
    ...overrides,
  } as WorkflowDefinition;
}

describe("Workflow Engine — YAML Executor", () => {
  beforeEach(() => {
    registerAction("test.noop", async () => ({ ok: true }));
    registerAction("test.echo", async (params) => ({ echo: params }));
  });

  describe("agent-delegate step parsing", () => {
    it("executes agent-delegate step via mock", async () => {
      const wf = validWorkflow({
        steps: [
          {
            id: "s1",
            type: "agent-delegate",
            agent: "writer",
            prompt: "Write a caption",
          },
        ] as any,
      });
      const result = await executeWorkflow(wf);

      expect(result.status).toBe("completed");
      expect(result.steps[0].status).toBe("success");
    });

    it("passes agent name and prompt to delegate", async () => {
      const { executeAgentDelegate } = await import(
        "@/server/workflows/agent-delegate"
      );
      const mockDelegate = vi.mocked(executeAgentDelegate);
      mockDelegate.mockClear();

      const wf = validWorkflow({
        steps: [
          {
            id: "s1",
            type: "agent-delegate",
            agent: "caption-writer",
            prompt: "Write engaging caption",
          },
        ] as any,
      });
      await executeWorkflow(wf);

      expect(mockDelegate).toHaveBeenCalledWith(
        "caption-writer",
        expect.stringContaining("Write engaging caption"),
        expect.anything(), // context
        undefined, // model
        undefined, // maxTokens
      );
    });
  });

  describe("parallel execution waves", () => {
    it("runs independent steps in same wave before dependent step", async () => {
      const executionOrder: string[] = [];

      registerAction("test.track-a", async () => {
        executionOrder.push("a");
        return {};
      });
      registerAction("test.track-b", async () => {
        executionOrder.push("b");
        return {};
      });
      registerAction("test.track-c", async () => {
        executionOrder.push("c");
        return {};
      });

      const wf = validWorkflow({
        steps: [
          { id: "a", type: "action", action: "test.track-a" },
          { id: "b", type: "action", action: "test.track-b" },
          {
            id: "c",
            type: "action",
            action: "test.track-c",
            dependsOn: ["a", "b"],
          },
        ] as any,
      });
      const result = await executeWorkflow(wf);

      expect(result.status).toBe("completed");
      // c must be last — a,b run in wave 1, c in wave 2
      expect(executionOrder.indexOf("c")).toBe(2);
      // a and b both before c
      expect(executionOrder.indexOf("a")).toBeLessThan(
        executionOrder.indexOf("c"),
      );
      expect(executionOrder.indexOf("b")).toBeLessThan(
        executionOrder.indexOf("c"),
      );
    });

    it("handles 3-wave dependency chain", async () => {
      const executionOrder: string[] = [];

      registerAction("test.wave1", async () => {
        executionOrder.push("wave1");
        return {};
      });
      registerAction("test.wave2", async () => {
        executionOrder.push("wave2");
        return {};
      });
      registerAction("test.wave3", async () => {
        executionOrder.push("wave3");
        return {};
      });

      const wf = validWorkflow({
        steps: [
          { id: "w1", type: "action", action: "test.wave1" },
          {
            id: "w2",
            type: "action",
            action: "test.wave2",
            dependsOn: ["w1"],
          },
          {
            id: "w3",
            type: "action",
            action: "test.wave3",
            dependsOn: ["w2"],
          },
        ] as any,
      });
      const result = await executeWorkflow(wf);

      expect(result.status).toBe("completed");
      expect(executionOrder).toEqual(["wave1", "wave2", "wave3"]);
    });

    it("detects circular dependency deadlock", async () => {
      const wf = validWorkflow({
        steps: [
          {
            id: "a",
            type: "action",
            action: "test.noop",
            dependsOn: ["b"],
          },
          {
            id: "b",
            type: "action",
            action: "test.noop",
            dependsOn: ["a"],
          },
        ] as any,
      });

      await expect(executeWorkflow(wf)).rejects.toThrow();
    });
  });

  describe("variable interpolation", () => {
    it("passes outputAs variables to downstream steps", async () => {
      registerAction("test.produce", async () => ({ value: 42 }));
      registerAction("test.consume", async (params) => params);

      const wf = validWorkflow({
        steps: [
          {
            id: "s1",
            type: "action",
            action: "test.produce",
            outputAs: "produced",
          },
          {
            id: "s2",
            type: "action",
            action: "test.consume",
            params: { data: "{{produced}}" },
            dependsOn: ["s1"],
          },
        ] as any,
      });
      const result = await executeWorkflow(wf);

      expect(result.status).toBe("completed");
      expect(result.variables.produced).toEqual({ value: 42 });
    });
  });

  describe("LLM budget integration", () => {
    it("aborts workflow when budget exceeded", async () => {
      const { checkLlmBudget } = await import("@/server/services/llm-budget");
      vi.mocked(checkLlmBudget).mockResolvedValueOnce({
        allowed: false,
        spentCents: 500,
        budgetCents: 500,
        remainingCents: 0,
        percentUsed: 100,
        message: "Budget exceeded",
      });

      const wf = validWorkflow({
        steps: [
          {
            id: "s1",
            type: "agent-delegate",
            agent: "writer",
            prompt: "Write something",
          },
        ] as any,
      });
      const result = await executeWorkflow(wf);

      expect(result.status).toBe("aborted");
      expect(
        result.steps.some((s) => s.error?.includes("LLM_BUDGET_EXCEEDED")),
      ).toBe(true);
    });
  });
});
