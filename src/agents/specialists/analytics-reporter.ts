import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

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

const AGENT_NAME = "analytics-reporter";

const analyticsReporterAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
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
