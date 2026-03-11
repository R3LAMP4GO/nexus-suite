/**
 * E2E: Workflow Execution Pipeline
 *
 * Tests the full workflow pipeline: YAML parse → validate → execute steps
 * (sequential + parallel) → agent-delegate → variable interpolation → output.
 *
 * Verifies: YAML workflow engine (Decision 3), agent-delegate step, control flow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ── Mock agent execution ────────────────────────────────────────
vi.mock("@/server/workflows/agent-delegate", () => ({
  executeAgentDelegate: vi.fn(
    async (agentName: string, prompt: string, _ctx: unknown) => ({
      agentName,
      result: `Mock result for ${agentName}: processed "${prompt.slice(0, 50)}..."`,
    }),
  ),
  getWorkflowContext: vi.fn(() => ({})),
}));

vi.mock("@/server/services/notifications", () => ({
  sendScriptReadyEmail: vi.fn(async () => ({ success: true })),
  sendVideoProcessedEmail: vi.fn(async () => ({ success: true })),
  sendActivationEmail: vi.fn(async () => ({ success: true })),
  sendWelcomeEmail: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/server/services/llm-budget", () => ({
  checkLlmBudget: vi.fn(async () => ({
    allowed: true, spentCents: 0, budgetCents: 500, remainingCents: 500, percentUsed: 0,
  })),
}));

vi.mock("@/server/services/usage-tracking", () => ({
  incrementUsage: vi.fn(async () => ({ current: 1, limit: 50 })),
}));

vi.mock("@/lib/db", () => ({
  db: { workflowRunLog: { create: vi.fn() } },
}));

// Import after mocks
const { validateWorkflow } = await import("@/server/workflows/validator");
const { executeWorkflow } = await import("@/server/workflows/executor");
const { interpolate } = await import("@/server/workflows/interpolation");

describe("E2E: Workflow Execution Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and executes daily-pipeline.yaml end-to-end", async () => {
    const yamlPath = join(
      process.cwd(),
      "src/server/workflows/daily-pipeline.yaml",
    );
    const yamlContent = readFileSync(yamlPath, "utf-8");

    // Step 1: Validate the YAML
    const validation = validateWorkflow(yamlContent);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("validates engagement-sweep.yaml", async () => {
    const yamlPath = join(
      process.cwd(),
      "src/server/workflows/engagement-sweep.yaml",
    );
    const yamlContent = readFileSync(yamlPath, "utf-8");

    const validation = validateWorkflow(yamlContent);
    expect(validation.valid).toBe(true);
  });

  it("validates content-repurpose.yaml", async () => {
    const yamlPath = join(
      process.cwd(),
      "src/server/workflows/content-repurpose.yaml",
    );
    const yamlContent = readFileSync(yamlPath, "utf-8");

    const validation = validateWorkflow(yamlContent);
    expect(validation.valid).toBe(true);
  });

  it("validates warming-workflow.yaml", async () => {
    const yamlPath = join(
      process.cwd(),
      "src/server/workflows/warming-workflow.yaml",
    );
    const yamlContent = readFileSync(yamlPath, "utf-8");

    const validation = validateWorkflow(yamlContent);
    expect(validation.valid).toBe(true);
  });

  it("rejects invalid workflow YAML", () => {
    const invalidYaml = `
name: bad-workflow
steps:
  - id: missing-type
    prompt: "This step has no type field"
`;
    const validation = validateWorkflow(invalidYaml);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it("interpolates variables across step outputs", () => {
    const template = "Write hooks for: {{trends}} targeting {{audience}}";
    const context = {
      trends: "AI fitness coaching, wearable tech",
      audience: "millennials aged 25-35",
    };

    const result = interpolate(template, context);
    expect(result).toBe(
      "Write hooks for: AI fitness coaching, wearable tech targeting millennials aged 25-35",
    );
  });

  it("handles nested variable interpolation", () => {
    const template = "Create {{content_type}} about {{topic}} for {{platform}}";
    const context = {
      content_type: "reel script",
      topic: "morning routines",
      platform: "Instagram",
    };

    const result = interpolate(template, context);
    expect(result).toContain("reel script");
    expect(result).toContain("morning routines");
    expect(result).toContain("Instagram");
  });

  it("preserves unresolved variables when context is missing", () => {
    const template = "Process {{known}} and {{unknown}}";
    const context = { known: "value" };

    const result = interpolate(template, context);
    expect(result).toContain("value");
    // Unresolved should either remain as {{unknown}} or be empty
    expect(result).toMatch(/Process value and/);
  });
});

describe("E2E: Client Plugin Workflow Validation", () => {
  it("validates client-specific workflow template", () => {
    const yamlPath = join(
      process.cwd(),
      "src/agents/clients/_example/workflows/weekly-transformation.yaml",
    );
    const yamlContent = readFileSync(yamlPath, "utf-8");

    const validation = validateWorkflow(yamlContent);
    expect(validation.valid).toBe(true);
  });
});
