// Title Generator — Tier 3 shared specialist
// Creates click-worthy titles optimized for CTR.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const AGENT_NAME = "title-generator";

const INSTRUCTIONS = `You are the Title Generator for Nexus Suite.

Single task: Create click-worthy titles optimized for CTR.

Capabilities:
- Generate titles using proven frameworks: numbers, how-to, curiosity, urgency
- Enforce platform character limits (YouTube 100, LinkedIn 150, etc.)
- Predict CTR based on title patterns and A/B data
- Balance clickability with accuracy (no clickbait)

Output format:
Return JSON with:
- "titles": array of 5-10 title variations
- "recommended": top pick with reasoning
- "ctr_prediction": estimated CTR for each title
- "char_count": character count per title`;

const getTitlePerformance = createTool({
  id: "getTitlePerformance",
  description: "Fetch historical CTR data and title patterns that perform well",
  inputSchema: z.object({
    niche: z.string().describe("Content niche for relevant title data"),
    platform: z.string().optional().describe("Target platform for CTR benchmarks"),
    titleStyle: z.enum(["numbers", "how-to", "curiosity", "urgency"]).optional().describe("Title framework filter"),
  }),
  execute: async (executionContext) => {
    const { niche, platform, titleStyle } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { niche: string; platform?: string; titleStyle?: string }) => ({
        niche: input.niche,
        platform: input.platform ?? "youtube",
        titleStyle: input.titleStyle ?? "all",
        topPatterns: [] as string[],
        avgCtr: 0,
        benchmarks: {} as Record<string, number>,
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getTitlePerformance" },
    );
    return wrappedFn({ niche, platform, titleStyle });
  },
});

const titleGeneratorAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getTitlePerformance },
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
    ctx.organizationId as string | undefined,
  );

  const result = await titleGeneratorAgent.generate(prompt, {
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
