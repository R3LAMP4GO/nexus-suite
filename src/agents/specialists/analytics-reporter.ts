import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const AGENT_NAME = "analytics-reporter";

const INSTRUCTIONS = `You are the Analytics Reporter for Nexus Suite.

Single task: Generate performance reports with trend detection and insights.

Capabilities:
- Query analytics data across platforms
- Detect performance trends (growth, decline, anomalies)
- Compare content performance across time periods
- Generate actionable insights and recommendations

Output format:
Return JSON with:
- "summary": executive summary of performance
- "metrics": { impressions, engagement_rate, reach, clicks, conversions }
- "trends": array of { metric, direction, magnitude, period }
- "top_content": best performing content in period
- "recommendations": array of actionable next steps`;

const queryAnalytics = createTool({
  id: "queryAnalytics",
  description: "Fetch engagement, reach, and follower data by platform and time period",
  inputSchema: z.object({
    platform: z.string().describe("Platform to query (youtube, tiktok, instagram, etc.)"),
    period: z.string().optional().describe("Time period: 7d, 30d, 90d"),
    metrics: z.array(z.string()).optional().describe("Specific metrics to fetch"),
  }),
  execute: async (executionContext) => {
    const { platform, period, metrics } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; period?: string; metrics?: string[] }) => ({
        platform: input.platform,
        period: input.period ?? "30d",
        metrics: input.metrics ?? ["impressions", "engagement_rate", "reach"],
        data: [] as Record<string, unknown>[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "queryAnalytics" },
    );
    return wrappedFn({ platform, period, metrics });
  },
});

const analyticsReporterAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { queryAnalytics },
});

export function createAgent() {
  return analyticsReporterAgent;
}

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

  const result = await analyticsReporterAgent.generate(prompt, {
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
