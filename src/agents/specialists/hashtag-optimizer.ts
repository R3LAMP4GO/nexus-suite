import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler, socialAnalyticsTool } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";

const INSTRUCTIONS = `You are the Hashtag Optimizer for Nexus Suite.

Single task: Research and select optimal hashtags for maximum reach.

Capabilities:
- Analyze trending hashtags per platform using CLI tools
- Mix branded, trending, and niche hashtags for optimal reach
- Enforce platform limits: IG 30 max, YT 15 max, TikTok 5-8 recommended, X 1-2, LinkedIn 3-5
- Track hashtag performance data

Output format:
Return JSON with:
- "hashtags": array of selected hashtags
- "categories": { branded: [], trending: [], niche: [] }
- "platform": target platform
- "reach_estimate": estimated reach per hashtag
- "recommended_count": optimal number for this platform`;

const AGENT_NAME = "hashtag-optimizer";

// Platform-specific recommended hashtag counts
const PLATFORM_HASHTAG_LIMITS: Record<string, { recommended: number; max: number }> = {
  instagram: { recommended: 15, max: 30 },
  tiktok: { recommended: 5, max: 8 },
  youtube: { recommended: 8, max: 15 },
  x: { recommended: 1, max: 2 },
  twitter: { recommended: 1, max: 2 },
  linkedin: { recommended: 3, max: 5 },
  facebook: { recommended: 5, max: 10 },
};

const getTrending = createTool({
  id: "getTrending",
  description: "Extract trending hashtags from top-performing tracked posts",
  inputSchema: z.object({
    platform: z.string().describe("Platform: instagram, tiktok, youtube, twitter, linkedin"),
    niche: z.string().optional().describe("Content niche to filter by"),
  }),
  execute: async (input) => {
    const { platform, niche } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; niche?: string }) => {
        const platformUpper = input.platform.toUpperCase();

        // Fetch recent high-performing posts to extract hashtags from titles/captions
        const posts = await db.trackedPost.findMany({
          where: {
            creator: { platform: platformUpper as never },
            publishedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
          },
          orderBy: { views: "desc" },
          take: 50,
          select: { title: true, views: true, likes: true },
        });

        // Extract hashtags from titles
        const hashtagCounts = new Map<string, { count: number; totalViews: number }>();
        for (const post of posts) {
          if (!post.title) continue;
          const tags = post.title.match(/#\w+/g) ?? [];
          for (const tag of tags) {
            const normalized = tag.toLowerCase();
            const existing = hashtagCounts.get(normalized) ?? { count: 0, totalViews: 0 };
            existing.count++;
            existing.totalViews += post.views;
            hashtagCounts.set(normalized, existing);
          }
        }

        // Sort by frequency * views for trending signal
        const trending = [...hashtagCounts.entries()]
          .map(([tag, data]) => ({ tag, count: data.count, avgViews: Math.round(data.totalViews / data.count) }))
          .sort((a, b) => (b.count * b.avgViews) - (a.count * a.avgViews))
          .slice(0, 20);

        const limits = PLATFORM_HASHTAG_LIMITS[input.platform.toLowerCase()] ?? { recommended: 5, max: 10 };

        return {
          platform: input.platform,
          niche: input.niche ?? "general",
          trending: trending.map((t) => t.tag),
          trendingDetails: trending,
          recommendedCount: limits.recommended,
          maxCount: limits.max,
          postsAnalyzed: posts.length,
        };
      },
      { agentName: AGENT_NAME, toolName: "getTrending" },
    );
    return wrappedFn({ platform, niche });
  },
});

const getHashtagAnalytics = createTool({
  id: "getHashtagAnalytics",
  description: "Get performance analytics for specific hashtags from tracked data",
  inputSchema: z.object({
    hashtags: z.array(z.string()).describe("Hashtags to analyze"),
    platform: z.string().describe("Target platform"),
  }),
  execute: async (input) => {
    const { hashtags, platform } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { hashtags: string[]; platform: string }) => {
        const platformUpper = input.platform.toUpperCase();

        // For each hashtag, find posts containing it and calculate metrics
        const analytics = await Promise.all(
          input.hashtags.map(async (hashtag) => {
            const tag = hashtag.startsWith("#") ? hashtag : `#${hashtag}`;

            const posts = await db.trackedPost.findMany({
              where: {
                creator: { platform: platformUpper as never },
                title: { contains: tag },
              },
              take: 50,
              select: { views: true, likes: true, comments: true },
            });

            const totalViews = posts.reduce((s, p) => s + p.views, 0);
            const totalEngagement = posts.reduce((s, p) => s + p.likes + p.comments, 0);
            const avgViews = posts.length > 0 ? Math.round(totalViews / posts.length) : 0;

            // Estimate competition: more posts = more competition
            const competition = posts.length > 20 ? "high" : posts.length > 5 ? "medium" : "low";

            return {
              hashtag: tag,
              postsFound: posts.length,
              avgViews,
              totalEngagement,
              engagementRate: totalViews > 0 ? Math.round((totalEngagement / totalViews) * 10000) / 100 : 0,
              competition,
            };
          }),
        );

        return {
          platform: input.platform,
          analytics,
        };
      },
      { agentName: AGENT_NAME, toolName: "getHashtagAnalytics" },
    );
    return wrappedFn({ hashtags, platform });
  },
});

const hashtagOptimizerAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getTrending, getHashtagAnalytics, socialAnalyticsTool },
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

  const result = await hashtagOptimizerAgent.generate(prompt, {
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
