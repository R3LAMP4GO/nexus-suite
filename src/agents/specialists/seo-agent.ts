import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { db } from "@/lib/db";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the SEO Agent for Nexus Suite.

Single task: Keyword research + content optimization for search visibility.

Capabilities:
- Research high-volume, low-competition keywords for content topics
- Optimize titles, descriptions, and body text for target keywords
- Analyze competitor keyword strategies
- Suggest internal linking opportunities
- Generate meta descriptions and alt text

Output format:
Return JSON with:
- "primary_keyword": main target keyword
- "secondary_keywords": array of supporting keywords
- "keyword_density": recommended density percentage
- "title_suggestion": SEO-optimized title
- "meta_description": max 160 chars
- "optimization_notes": specific recommendations`;

const AGENT_NAME = "seo-agent";

const tavilySearch = createTool({
  id: "tavilySearch",
  description: "Search the web for SEO keyword research and competitor analysis",
  inputSchema: z.object({
    query: z.string().describe("Search query for SEO research"),
    searchDepth: z.enum(["basic", "advanced"]).optional().describe("Search depth"),
  }),
  execute: async (input) => {
    const { query, searchDepth } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; searchDepth?: string }) => {
        const words = input.query.toLowerCase().split(/\s+/);

        // Search tracked posts for relevant content (competitor intelligence)
        const posts = await db.trackedPost.findMany({
          where: {
            OR: words.slice(0, 3).map((w) => ({
              title: { contains: w, mode: "insensitive" as const },
            })),
          },
          orderBy: { views: "desc" },
          take: input.searchDepth === "advanced" ? 20 : 10,
          select: {
            title: true,
            url: true,
            views: true,
            likes: true,
            comments: true,
            analysis: true,
            creator: { select: { username: true, platform: true } },
          },
        });

        return {
          query: input.query,
          searchDepth: input.searchDepth ?? "basic",
          results: posts.map((p) => ({
            title: p.title ?? "Untitled",
            url: p.url ?? "",
            snippet: `${p.views?.toLocaleString() ?? 0} views, ${p.likes?.toLocaleString() ?? 0} likes on ${p.creator?.platform ?? "unknown"}`,
            engagement: p.views ? ((p.likes + p.comments) / p.views) * 100 : 0,
            platform: p.creator?.platform ?? "unknown",
            creator: p.creator?.username ?? "unknown",
          })),
          source: "tracked-posts-database",
          totalResults: posts.length,
        };
      },
      { agentName: AGENT_NAME, toolName: "tavilySearch" },
    );
    return wrappedFn({ query, searchDepth });
  },
});

const youtubeSearch = createTool({
  id: "youtubeSearch",
  description: "Search YouTube for keyword performance and competitor videos",
  inputSchema: z.object({
    query: z.string().describe("YouTube search query"),
    maxResults: z.number().optional().describe("Number of results"),
  }),
  execute: async (input) => {
    const { query, maxResults } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; maxResults?: number }) => {
        const words = input.query.toLowerCase().split(/\s+/);
        const limit = input.maxResults ?? 10;

        const videos = await db.trackedPost.findMany({
          where: {
            creator: { platform: "YOUTUBE" },
            OR: words.slice(0, 3).map((w) => ({
              title: { contains: w, mode: "insensitive" as const },
            })),
          },
          orderBy: { views: "desc" },
          take: limit,
          select: {
            title: true,
            url: true,
            views: true,
            likes: true,
            comments: true,
            publishedAt: true,
            creator: { select: { username: true, followerCount: true } },
          },
        });

        return {
          query: input.query,
          maxResults: limit,
          videos: videos.map((v) => ({
            title: v.title ?? "Untitled",
            url: v.url ?? "",
            views: v.views ?? 0,
            likes: v.likes ?? 0,
            comments: v.comments ?? 0,
            channel: v.creator?.username ?? "unknown",
            subscribers: v.creator?.followerCount ?? 0,
            publishedAt: v.publishedAt?.toISOString() ?? null,
            engagementRate: v.views ? ((v.likes + v.comments) / v.views) * 100 : 0,
          })),
          source: "tracked-posts-database",
        };
      },
      { agentName: AGENT_NAME, toolName: "youtubeSearch" },
    );
    return wrappedFn({ query, maxResults });
  },
});

const getKeywordMetrics = createTool({
  id: "getKeywordMetrics",
  description: "Get search volume, competition, and difficulty metrics for keywords",
  inputSchema: z.object({
    keywords: z.array(z.string()).describe("Keywords to analyze"),
    region: z.string().optional().describe("Geographic region"),
  }),
  execute: async (input) => {
    const { keywords, region } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { keywords: string[]; region?: string }) => {
        const metrics = await Promise.all(
          input.keywords.map(async (kw) => {
            const kwLower = kw.toLowerCase();

            // Count how many tracked posts mention this keyword
            const mentionCount = await db.trackedPost.count({
              where: {
                title: { contains: kwLower, mode: "insensitive" },
              },
            });

            // Get avg engagement for posts with this keyword
            const posts = await db.trackedPost.findMany({
              where: {
                title: { contains: kwLower, mode: "insensitive" },
              },
              select: { views: true, likes: true, comments: true },
              take: 50,
            });

            const avgViews = posts.length > 0
              ? Math.round(posts.reduce((s, p) => s + (p.views ?? 0), 0) / posts.length)
              : 0;
            const avgEngagement = posts.length > 0
              ? posts.reduce((s, p) => s + (p.views ? ((p.likes + p.comments) / p.views) * 100 : 0), 0) / posts.length
              : 0;

            // Heuristic: high mentions + high views = high competition
            const competition = mentionCount > 20 ? "high" : mentionCount > 5 ? "medium" : "low";
            const difficulty = Math.min(100, Math.round(mentionCount * 3 + (avgViews > 100000 ? 30 : avgViews > 10000 ? 15 : 0)));

            return {
              keyword: kw,
              volume: avgViews,
              competition,
              difficulty,
              mentionsInTrackedPosts: mentionCount,
              avgEngagementRate: Math.round(avgEngagement * 100) / 100,
              opportunity: competition === "low" && avgEngagement > 3 ? "high" : competition === "medium" ? "medium" : "low",
            };
          }),
        );

        return {
          region: input.region ?? "global",
          metrics,
          source: "tracked-posts-heuristic",
          note: "Metrics derived from tracked competitor posts — not traditional SEO volume data",
        };
      },
      { agentName: AGENT_NAME, toolName: "getKeywordMetrics" },
    );
    return wrappedFn({ keywords, region });
  },
});

const seoAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { tavilySearch, youtubeSearch, getKeywordMetrics },
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

  const result = await seoAgent.generate(prompt, {
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
