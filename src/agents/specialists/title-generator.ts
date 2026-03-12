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
import { db } from "@/lib/db";

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
  description: "Fetch historical title performance data from tracked posts",
  inputSchema: z.object({
    niche: z.string().describe("Content niche for relevant title data"),
    platform: z.string().optional().describe("Target platform for CTR benchmarks"),
    titleStyle: z.enum(["numbers", "how-to", "curiosity", "urgency"]).optional().describe("Title framework filter"),
  }),
  execute: async (executionContext) => {
    const { niche, platform, titleStyle } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { niche: string; platform?: string; titleStyle?: string }) => {
        const platformUpper = (input.platform ?? "youtube").toUpperCase();

        // Fetch top-performing tracked posts with titles
        const posts = await db.trackedPost.findMany({
          where: {
            title: { not: null },
            creator: { platform: platformUpper as never },
          },
          orderBy: { views: "desc" },
          take: 50,
          select: {
            title: true,
            views: true,
            likes: true,
            comments: true,
            isOutlier: true,
          },
        });

        // Filter by title style if specified
        let filtered = posts;
        if (input.titleStyle && input.titleStyle !== "all") {
          const stylePatterns: Record<string, RegExp> = {
            numbers: /\b\d+\b/,
            "how-to": /\bhow\s+to\b/i,
            curiosity: /\b(secret|reveal|truth|hidden|nobody|won't believe)\b/i,
            urgency: /\b(now|today|before|hurry|last chance|don't miss|stop)\b/i,
          };
          const pattern = stylePatterns[input.titleStyle];
          if (pattern) {
            filtered = posts.filter((p) => p.title && pattern.test(p.title));
          }
        }

        const topPatterns = filtered.slice(0, 15).map((p) => p.title!);

        // Calculate engagement benchmarks
        const totalViews = filtered.reduce((s, p) => s + p.views, 0);
        const totalLikes = filtered.reduce((s, p) => s + p.likes, 0);
        const avgEngagement = totalViews > 0 ? (totalLikes / totalViews) * 100 : 0;

        // Group by title style for benchmarks
        const benchmarks: Record<string, number> = {};
        for (const style of ["numbers", "how-to", "curiosity", "urgency"] as const) {
          const stylePatterns: Record<string, RegExp> = {
            numbers: /\b\d+\b/,
            "how-to": /\bhow\s+to\b/i,
            curiosity: /\b(secret|reveal|truth|hidden|nobody|won't believe)\b/i,
            urgency: /\b(now|today|before|hurry|last chance|don't miss|stop)\b/i,
          };
          const matched = posts.filter((p) => p.title && stylePatterns[style]!.test(p.title));
          const views = matched.reduce((s, p) => s + p.views, 0);
          const likes = matched.reduce((s, p) => s + p.likes, 0);
          benchmarks[style] = views > 0 ? Math.round((likes / views) * 10000) / 100 : 0;
        }

        return {
          niche: input.niche,
          platform: input.platform ?? "youtube",
          titleStyle: input.titleStyle ?? "all",
          topPatterns,
          avgEngagementRate: Math.round(avgEngagement * 100) / 100,
          benchmarks,
          totalPostsAnalyzed: posts.length,
        };
      },
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
