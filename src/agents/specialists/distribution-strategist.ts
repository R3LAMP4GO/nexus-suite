import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";

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
      async (input: { platform: string; organizationId?: string }) => {
        const where: Record<string, unknown> = {
          circuitState: { not: "OPEN" },
        };
        if (input.organizationId) where.organizationId = input.organizationId;
        if (input.platform) where.platform = input.platform;

        const accounts = await db.orgPlatformToken.findMany({
          where: where as any,
          select: {
            id: true, platform: true, accountLabel: true,
            accountType: true, healthScore: true, circuitState: true,
            warmupStatus: true,
          },
          orderBy: { healthScore: "desc" },
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const postCounts = await db.postRecord.groupBy({
          by: ["accountId"],
          where: {
            accountId: { in: accounts.map((a) => a.id) },
            scheduledAt: { gte: today },
            status: { in: ["SCHEDULED", "POSTING", "SUCCESS"] },
          },
          _count: { id: true },
        });
        const countMap = new Map(postCounts.map((r) => [r.accountId, r._count.id]));

        return accounts.map((a) => ({
          ...a,
          todayPostCount: countMap.get(a.id) ?? 0,
        }));
      },
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
      async (input: { organizationId: string }) => {
        const org = await db.organization.findUnique({
          where: { id: input.organizationId },
          select: { brandConfig: true },
        });
        const config = org?.brandConfig as Record<string, unknown> | null;
        const pw = (config?.postingWindows as Record<string, string>) ?? {};
        return {
          timezone: (config?.timezone as string) ?? "America/New_York",
          windows: {
            TIKTOK: pw.TIKTOK ?? "18:00-22:00",
            INSTAGRAM: pw.INSTAGRAM ?? "07:00-09:00",
            YOUTUBE: pw.YOUTUBE ?? "12:00-16:00",
            FACEBOOK: pw.FACEBOOK ?? "07:00-09:00",
            X: pw.X ?? "12:00-15:00",
          },
        };
      },
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
      async (input: { organizationId: string }) => {
        const org = await db.organization.findUnique({
          where: { id: input.organizationId },
          select: { brandConfig: true },
        });
        const config = org?.brandConfig as Record<string, unknown> | null;
        const overrides = (config?.dailyCaps as Record<string, number>) ?? {};
        return {
          TIKTOK: overrides.TIKTOK ?? 3,
          INSTAGRAM: overrides.INSTAGRAM ?? 2,
          YOUTUBE: overrides.YOUTUBE ?? 5,
          FACEBOOK: overrides.FACEBOOK ?? 2,
          X: overrides.X ?? 5,
        };
      },
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
