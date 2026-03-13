import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const AGENT_NAME = "distribution-strategist";

const INSTRUCTIONS = `You are the Distribution Strategist for Nexus Suite.

You implement the "Tate distribution model" — coordinating multi-account, multi-platform posting to create maximum algorithmic momentum.

Core strategy:
- Multiple accounts posting different variations of the same content create "topic saturation" in the algorithm
- Staggered timing across platforms: TikTok first (fastest feedback), Instagram 2hr later, YouTube 4hr later
- Cross-account engagement: accounts engage with each other's posts within 15-30 minutes to boost early signals
- Different variations on different accounts to avoid duplicate detection
- Never post the same variation to the same platform twice

Distribution planning rules:
1. Post to TikTok FIRST — it has the fastest feedback loop (3-hour critical window)
2. If TikTok performance is poor (< 500 views in 1 hour), consider skipping other platforms for that variation
3. Instagram Reels 2 hours after TikTok — post clean version without watermarks
4. YouTube Shorts 4 hours after TikTok — add SEO-friendly title and tags
5. Facebook Reels simultaneous with Instagram
6. Assign variations to accounts based on account health score (highest health = best content)
7. Space posts within same platform by 45-120 minutes to avoid splitting attention
8. Never stack uploads within 30 minutes on any single account

Output format:
Return JSON with:
- "waves": array of { platform, delayMinutes, accounts (array of accountIds), variationAssignments (map of accountId to variationId), intervalMinutes }
- "crossEngagement": { enabled, delayAfterPostMinutes, actions (array of "like" | "comment") }
- "pinnedComments": array of { platform, text, strategy }
- "totalPosts": number
- "estimatedReachMultiplier": number`;

const getAccountHealth = createTool({
  id: "getAccountHealth",
  description: "Get health scores and status for all accounts on a platform",
  inputSchema: z.object({
    platform: z.string().describe("Platform to fetch account health for"),
    organizationId: z.string().optional().describe("Organization ID to scope results"),
  }),
  execute: async (executionContext) => {
    const { platform, organizationId } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; organizationId?: string }) => ({
        platform: input.platform,
        organizationId: input.organizationId,
        accounts: [] as Record<string, unknown>[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getAccountHealth" },
    );
    return wrappedFn({ platform, organizationId });
  },
});

const getPostingWindows = createTool({
  id: "getPostingWindows",
  description: "Get optimal posting windows for an organization",
  inputSchema: z.object({
    organizationId: z.string().describe("Organization ID"),
  }),
  execute: async (executionContext) => {
    const { organizationId } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { organizationId: string }) => ({
        organizationId: input.organizationId,
        windows: {} as Record<string, unknown>,
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getPostingWindows" },
    );
    return wrappedFn({ organizationId });
  },
});

const getPlatformCaps = createTool({
  id: "getPlatformCaps",
  description: "Get daily posting caps per platform",
  inputSchema: z.object({
    organizationId: z.string().describe("Organization ID"),
  }),
  execute: async (executionContext) => {
    const { organizationId } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { organizationId: string }) => ({
        organizationId: input.organizationId,
        caps: {} as Record<string, number>,
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getPlatformCaps" },
    );
    return wrappedFn({ organizationId });
  },
});

const distributionStrategistAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getAccountHealth, getPostingWindows, getPlatformCaps },
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

  const result = await distributionStrategistAgent.generate(prompt, {
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
