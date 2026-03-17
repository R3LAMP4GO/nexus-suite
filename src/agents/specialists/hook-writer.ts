import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";

const INSTRUCTIONS = `You are the Hook Writer for Nexus Suite.

Single task: Create viral opening hooks (first 1-3 seconds) that stop the scroll.

You have access to REAL PERFORMANCE DATA via the getTopPerformingHooks tool. ALWAYS check
actual hook performance data before generating new hooks — learn from what worked and what didn't.

Strategy:
1. First call getTopPerformingHooks to see which hooks and frameworks are winning
2. Bias new hooks toward frameworks with high engagement rates (but still explore new styles)
3. If a hook framework has low confidence (few uses), try it more to gather data
4. Generate 3-5 hooks: 2-3 from the best-performing framework, 1-2 from exploration frameworks

Capabilities:
- Generate pattern-interrupt opening lines for videos and posts
- Apply proven viral hook frameworks: curiosity gap, controversy, transformation, shock
- Learn from actual engagement data via Thompson Sampling feedback loop
- Tailor hooks to platform-specific audience behavior

Output format:
Return JSON with:
- "hooks": array of 3-5 hook variations, each with { hookText, frameworkUsed, estimatedRetentionPercent, platformFit (1-10), isExploration (boolean) }
- "performanceContext": summary of what the data says works best
- "explorationRatio": what % of hooks are exploratory vs exploitation`;

const AGENT_NAME = "hook-writer";

const searchViralPatterns = createTool({
  id: "searchViralPatterns",
  description: "Search for proven viral hook patterns and frameworks from outlier tracked posts",
  inputSchema: z.object({
    platform: z.string().describe("Target platform"),
    niche: z.string().optional().describe("Content niche"),
  }),
  execute: async (executionContext) => {
    const { platform, niche } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; niche?: string }) => {
        const platformUpper = input.platform.toUpperCase();

        // Fetch outlier posts — these are the viral ones
        const outliers = await db.trackedPost.findMany({
          where: {
            isOutlier: true,
            creator: { platform: platformUpper as never },
          },
          orderBy: { views: "desc" },
          take: 20,
          select: {
            title: true,
            views: true,
            likes: true,
            comments: true,
            analysis: true,
            outlierScore: true,
          },
        });

        // Extract patterns from titles (hooks are typically the title/first line)
        const patterns = outliers
          .filter((p) => p.title)
          .map((p) => ({
            hook: p.title!,
            views: p.views,
            engagementRate: p.views > 0 ? ((p.likes + p.comments) / p.views) * 100 : 0,
            outlierScore: p.outlierScore,
          }));

        return {
          platform: input.platform,
          niche: input.niche ?? "general",
          patterns,
          totalOutliers: outliers.length,
        };
      },
      { agentName: AGENT_NAME, toolName: "searchViralPatterns" },
    );
    return wrappedFn({ platform, niche });
  },
});

const getWinnerLogs = createTool({
  id: "getWinnerLogs",
  description: "Fetch historical winning hooks with retention data from top-performing scripts",
  inputSchema: z.object({
    platform: z.string().describe("Target platform"),
    limit: z.number().optional().describe("Number of results"),
  }),
  execute: async (executionContext) => {
    const { platform, limit } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; limit?: number }) => {
        const resultLimit = input.limit ?? 10;

        // Fetch scripts with hookText — these are the "winner" hooks
        const scripts = await db.script.findMany({
          where: { status: "APPROVED" },
          orderBy: { updatedAt: "desc" },
          take: resultLimit,
          select: {
            title: true,
            hookText: true,
            updatedAt: true,
          },
        });

        // Also fetch top-performing tracked posts as engagement reference
        const topPosts = await db.trackedPost.findMany({
          where: {
            creator: { platform: input.platform.toUpperCase() as never },
            isOutlier: true,
          },
          orderBy: { views: "desc" },
          take: resultLimit,
          select: {
            title: true,
            views: true,
            likes: true,
          },
        });

        const winners = [
          ...scripts.map((s) => ({
            hook: s.hookText,
            source: "script" as const,
            title: s.title,
            retention: 0, // No retention data in DB yet
          })),
          ...topPosts.filter((p) => p.title).map((p) => ({
            hook: p.title!,
            source: "outlier_post" as const,
            title: p.title!,
            retention: p.views > 0 ? Math.min(100, Math.round((p.likes / p.views) * 100 * 3)) : 0,
          })),
        ].slice(0, resultLimit);

        return {
          platform: input.platform,
          limit: resultLimit,
          winners,
        };
      },
      { agentName: AGENT_NAME, toolName: "getWinnerLogs" },
    );
    return wrappedFn({ platform, limit });
  },
});

// Hook templates are static reference data — no external API needed
const HOOK_TEMPLATES: Record<string, Record<string, string[]>> = {
  youtube: {
    curiosity_gap: [
      "I can't believe [X] actually works...",
      "Nobody is talking about [X]",
      "The [X] that changed everything",
    ],
    controversy: [
      "Why [popular opinion] is completely wrong",
      "I stopped [common practice] and here's what happened",
      "[Authority figure] was wrong about [X]",
    ],
    transformation: [
      "How I went from [bad state] to [good state] in [timeframe]",
      "[Result] using only [simple method]",
      "I tried [X] for 30 days — here are my results",
    ],
    urgency: [
      "Do this BEFORE [event/deadline]",
      "[X] is changing and nobody is ready",
      "You have [time] left to [action]",
    ],
  },
  tiktok: {
    curiosity_gap: [
      "Wait for it...",
      "POV: you just discovered [X]",
      "Tell me you [X] without telling me you [X]",
    ],
    controversy: [
      "Unpopular opinion: [X]",
      "This is why [common belief] is wrong",
      "Hot take: [X]",
    ],
    transformation: [
      "Glow up from [X] to [Y]",
      "Day 1 vs Day 30 of [X]",
      "What [small action] did for me",
    ],
    urgency: [
      "Run don't walk to [X]",
      "Before this goes viral...",
      "Save this for later",
    ],
  },
  instagram: {
    curiosity_gap: [
      "Swipe to see the transformation →",
      "The secret behind [X]",
      "You won't believe what happened next",
    ],
    transformation: [
      "Before → After: [X]",
      "How [small change] made a huge difference",
      "My [timeframe] journey with [X]",
    ],
  },
};

const getPlatformTemplates = createTool({
  id: "getPlatformTemplates",
  description: "Get platform-specific hook templates and structures",
  inputSchema: z.object({
    platform: z.string().describe("Target platform"),
    hookType: z.string().optional().describe("Hook framework type"),
  }),
  execute: async (executionContext) => {
    const { platform, hookType } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; hookType?: string }) => {
        const platformKey = input.platform.toLowerCase();
        const allTemplates = HOOK_TEMPLATES[platformKey] ?? HOOK_TEMPLATES.youtube ?? {};

        if (input.hookType && input.hookType !== "all") {
          return {
            platform: input.platform,
            hookType: input.hookType,
            templates: allTemplates[input.hookType] ?? [],
          };
        }

        return {
          platform: input.platform,
          hookType: "all",
          templates: allTemplates,
        };
      },
      { agentName: AGENT_NAME, toolName: "getPlatformTemplates" },
    );
    return wrappedFn({ platform, hookType });
  },
});

const getTopPerformingHooks = createTool({
  id: "getTopPerformingHooks",
  description: "Get top-performing hooks ranked by Thompson Sampling score from actual engagement data. ALWAYS call this first to learn from real performance before generating new hooks.",
  inputSchema: z.object({
    platform: z.string().describe("Target platform"),
    organizationId: z.string().optional().describe("Organization ID"),
    limit: z.number().default(10).describe("Number of top hooks to return"),
  }),
  execute: async (executionContext) => {
    const { platform, organizationId, limit } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; organizationId?: string; limit: number }) => {
        const { sampleTopHooks, getFrameworkStats } = await import("@/server/services/hook-performance");

        if (!input.organizationId) {
          return {
            hooks: [],
            frameworkStats: [],
            message: "No organization ID — cannot fetch hook performance data",
          };
        }

        const [topHooks, frameworkStats] = await Promise.all([
          sampleTopHooks(input.organizationId, input.platform, input.limit),
          getFrameworkStats(input.organizationId, input.platform),
        ]);

        return {
          hooks: topHooks,
          frameworkStats,
          recommendation: frameworkStats.length > 0
            ? `Best framework: ${frameworkStats.sort((a, b) => b.avgEngagement - a.avgEngagement)[0]?.framework ?? "unknown"} (${frameworkStats[0]?.avgEngagement ?? 0} avg engagement)`
            : "No performance data yet — explore all frameworks equally",
          totalTrackedHooks: topHooks.length,
        };
      },
      { agentName: AGENT_NAME, toolName: "getTopPerformingHooks" },
    );
    return wrappedFn({ platform, organizationId, limit });
  },
});

const hookWriterAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { searchViralPatterns, getWinnerLogs, getPlatformTemplates, getTopPerformingHooks },
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

  const result = await hookWriterAgent.generate(prompt, {
    instructions: systemPrompt,
    modelSettings: { maxOutputTokens: opts?.maxTokens },
  });

  return {
    text: result.text,
    usage: result.usage
      ? {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          model: opts?.model ?? "default",
        }
      : undefined,
    toolCalls: result.toolCalls?.map((tc) => ({
      name: tc.payload.toolName,
      args: tc.payload.args as Record<string, unknown>,
      result: undefined,
    })),
  };
}
