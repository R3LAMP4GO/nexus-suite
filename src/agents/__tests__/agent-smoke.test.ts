// Agent Smoke Tests — verifies the structural integrity of all 44 agents.
// Does NOT call real LLMs. Tests registration, delegation chain, context stripping,
// safety enforcement, and tool scope compliance.

import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock Mastra Agent.generate to avoid real LLM calls
vi.mock("@mastra/core/agent", () => {
  const mockGenerate = vi.fn(async () => ({
    text: "mock-agent-response",
    usage: { promptTokens: 10, completionTokens: 20 },
    toolCalls: [],
  }));

  class MockAgent {
    name: string;
    instructions: string;
    model: unknown;
    tools: unknown;

    constructor(opts: { name: string; instructions: string; model: unknown; tools: unknown }) {
      this.name = opts.name;
      this.instructions = opts.instructions;
      this.model = opts.model;
      this.tools = opts.tools;
    }

    generate = mockGenerate;
  }

  return { Agent: MockAgent };
});

// Mock Zhipu provider
vi.mock("zhipu-ai-provider", () => ({
  createZhipu: () => (model: string) => ({ model, provider: "zhipu-mock" }),
}));

// Mock DB
vi.mock("@/lib/db", () => ({ db: {} }));

// Mock LLM budget (avoid Redis)
vi.mock("@/server/services/llm-budget", () => ({
  trackLlmSpend: vi.fn(async () => {}),
  checkLlmBudget: vi.fn(async () => ({ allowed: true, remainingCents: 500 })),
}));

// Mock usage tracking
vi.mock("@/server/services/usage-tracking", () => ({
  incrementUsage: vi.fn(async () => {}),
  checkUsageLimit: vi.fn(async () => ({ allowed: true, current: 0, limit: 100 })),
}));

// Mock notifications
vi.mock("@/server/services/notifications", () => ({
  sendScriptReadyEmail: vi.fn(async () => {}),
  sendActivationEmail: vi.fn(async () => {}),
}));

import { bootstrapAgents } from "../registry";
import { getRegisteredAgents, executeAgentDelegate } from "@/server/workflows/agent-delegate";
import { prepareContext } from "../general/prepare-context";
import { enforceToolScope } from "../general/safety";

const EXPECTED_AGENTS = [
  // Tier 1 (orchestrator registered under both canonical + agent name)
  "nexus-orchestrator", "orchestrator", "workflow-agent",
  // Tier 2
  "youtube-main", "tiktok-main", "instagram-main", "linkedin-main", "x-main", "facebook-agent",
  // Tier 2.5
  "community-post-formatter", "shorts-optimizer",
  "duet-stitch-logic", "sound-selector",
  "carousel-sequencer", "story-formatter",
  "professional-tone-adapter", "article-formatter",
  "news-scout", "tone-translator", "x-engagement-responder",
  // Tier 3
  "seo-agent", "hook-writer", "title-generator", "thumbnail-creator",
  "script-agent", "caption-writer", "hashtag-optimizer", "thread-writer",
  "article-writer", "trend-scout", "engagement-responder",
  "analytics-reporter", "content-repurposer", "quality-scorer",
  "variation-orchestrator", "brand-persona-agent", "viral-teardown-agent",
  // Tier 3+ (newer agents)
  "auto-clipper", "caption-generator", "content-recreator",
  "distribution-strategist", "edit-director", "reply-jacker", "transcript-extractor",
];

beforeAll(() => {
  bootstrapAgents();
});

describe("Agent Registry", () => {
  it("registers all 44 expected agents", () => {
    const registry = getRegisteredAgents();
    for (const name of EXPECTED_AGENTS) {
      expect(registry.has(name), `Agent "${name}" not registered`).toBe(true);
    }
    expect(registry.size).toBe(EXPECTED_AGENTS.length);
  });

  it("every registered agent has a generateFn", () => {
    const registry = getRegisteredAgents();
    for (const [name, entry] of registry) {
      expect(typeof entry.generateFn, `Agent "${name}" missing generateFn`).toBe("function");
    }
  });
});

describe("Agent Delegation Chain", () => {
  const mockContext = {
    organizationId: "org_test",
    workflowName: "smoke-test",
    runId: "run_001",
    variables: {},
    config: {},
    input: { userPrompt: "test prompt" },
    aborted: false,
  };

  it("orchestrator can be invoked via executeAgentDelegate", async () => {
    const result = await executeAgentDelegate("nexus-orchestrator", "Test task", mockContext);
    expect(result).toBeDefined();
    expect((result as { text: string }).text).toBeDefined();
  });

  it("specialist agents can be invoked directly", async () => {
    const specialists = ["hook-writer", "script-agent", "caption-writer", "title-generator"];
    for (const name of specialists) {
      const result = await executeAgentDelegate(name, "Generate test content", mockContext);
      expect(result).toBeDefined();
      expect((result as { text: string }).text).toBeDefined();
    }
  });

  it("platform agents can be invoked directly", async () => {
    const platforms = ["youtube-main", "tiktok-main", "x-main"];
    for (const name of platforms) {
      const result = await executeAgentDelegate(name, "Create platform content", mockContext);
      expect(result).toBeDefined();
    }
  });

  it("throws for unknown agent", async () => {
    await expect(
      executeAgentDelegate("nonexistent-agent", "test", mockContext),
    ).rejects.toThrow(/not found/);
  });
});

describe("Context Stripping (Data Minimization)", () => {
  const fullContext = {
    organizationId: "org_1",
    workflowName: "pipeline",
    runId: "run_x",
    input: { topic: "AI" },
    variables: { lang: "en" },
    config: { model: "gpt-4", secretKey: "sk-xxx" },
  };

  it("orchestrator gets full context", () => {
    const result = prepareContext(fullContext, "orchestrator");
    expect(result.config).toBeDefined();
    expect(result.workflowName).toBe("pipeline");
  });

  it("specialists get only orgId + input", () => {
    const result = prepareContext(fullContext, "hook-writer");
    expect(result.organizationId).toBe("org_1");
    expect(result.input).toEqual({ topic: "AI" });
    expect(result.config).toBeUndefined();
    expect(result.variables).toBeUndefined();
  });

  it("platform agents get orgId + input + variables (no config)", () => {
    const result = prepareContext(fullContext, "youtube-main");
    expect(result.organizationId).toBe("org_1");
    expect(result.variables).toEqual({ lang: "en" });
    expect(result.config).toBeUndefined();
  });
});

describe("Tool Scope Enforcement", () => {
  it("hook-writer can call its own tools", () => {
    expect(() => enforceToolScope("hook-writer", "searchViralPatterns")).not.toThrow();
    expect(() => enforceToolScope("hook-writer", "getWinnerLogs")).not.toThrow();
    expect(() => enforceToolScope("hook-writer", "getPlatformTemplates")).not.toThrow();
  });

  it("hook-writer cannot call SEO tools", () => {
    expect(() => enforceToolScope("hook-writer", "tavilySearch")).toThrow(/not permitted/);
  });

  it("trend-scout can call its own tools", () => {
    expect(() => enforceToolScope("trend-scout", "tavilySearch")).not.toThrow();
    expect(() => enforceToolScope("trend-scout", "searchTwitter")).not.toThrow();
  });

  it("trend-scout cannot call hook-writer tools", () => {
    expect(() => enforceToolScope("trend-scout", "getWinnerLogs")).toThrow(/not permitted/);
  });

  it("orchestrator has unrestricted access (not in TOOL_SCOPE)", () => {
    expect(() => enforceToolScope("orchestrator", "anyTool")).not.toThrow();
  });
});
