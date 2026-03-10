import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Quality Scorer for Nexus Suite.

Single task: Score content quality before distribution, enforce quality thresholds.

Capabilities:
- Score content on: grammar, clarity, engagement potential, brand alignment, SEO
- Apply editing rules and style guides
- Flag content below quality thresholds for revision
- Provide specific improvement suggestions

Output format:
Return JSON with:
- "overall_score": 0-100 quality score
- "scores": { grammar, clarity, engagement, brand_alignment, seo }
- "pass": boolean (true if above threshold)
- "threshold": minimum required score
- "issues": array of specific problems found
- "suggestions": array of improvement recommendations`;

const AGENT_NAME = "quality-scorer";

const getEditingRules = createTool({
  id: "getEditingRules",
  description: "Fetch editing rules and style guide for content evaluation",
  inputSchema: z.object({
    contentType: z.string().describe("Type of content: post, article, script, caption"),
    platform: z.string().optional().describe("Target platform"),
  }),
  execute: async (executionContext) => {
    const { contentType, platform } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { contentType: string; platform?: string }) => ({
        contentType: input.contentType,
        platform: input.platform ?? "general",
        rules: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getEditingRules" },
    );
    return wrappedFn({ contentType, platform });
  },
});

const getQualityThresholds = createTool({
  id: "getQualityThresholds",
  description: "Fetch minimum quality thresholds for content approval",
  inputSchema: z.object({
    contentType: z.string().describe("Type of content"),
    tier: z.enum(["draft", "review", "publish"]).optional().describe("Quality tier"),
  }),
  execute: async (executionContext) => {
    const { contentType, tier } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { contentType: string; tier?: string }) => ({
        contentType: input.contentType,
        tier: input.tier ?? "publish",
        minimumScore: 70,
        categoryMinimums: { grammar: 60, clarity: 60, engagement: 50, brand_alignment: 65, seo: 50 },
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getQualityThresholds" },
    );
    return wrappedFn({ contentType, tier });
  },
});

const scoreContent = createTool({
  id: "scoreContent",
  description: "Score content quality on a 0-100 scale across multiple dimensions",
  inputSchema: z.object({
    content: z.string().describe("Content text to score"),
    contentType: z.string().describe("Type: post, article, script, caption"),
    platform: z.string().optional().describe("Target platform"),
  }),
  execute: async (executionContext) => {
    const { content, contentType, platform } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { content: string; contentType: string; platform?: string }) => ({
        contentType: input.contentType,
        platform: input.platform ?? "general",
        overall_score: 0,
        scores: { grammar: 0, clarity: 0, engagement: 0, brand_alignment: 0, seo: 0 },
        pass: false,
        threshold: 70,
        issues: [] as string[],
        suggestions: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "scoreContent" },
    );
    return wrappedFn({ content, contentType, platform });
  },
});

const qualityScorerAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getEditingRules, getQualityThresholds, scoreContent },
});

export async function generate(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
  );

  const result = await qualityScorerAgent.generate(prompt, {
    instructions: systemPrompt,
    maxTokens: opts?.maxTokens,
  });

  return {
    text: result.text,
    usage: result.usage
      ? {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          model: opts?.model ?? "default",
        }
      : undefined,
    toolCalls: result.toolCalls?.map((tc) => ({
      name: tc.toolName,
      args: tc.args as Record<string, unknown>,
      result: undefined,
    })),
  };
}
