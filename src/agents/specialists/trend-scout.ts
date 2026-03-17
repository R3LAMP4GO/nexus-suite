// Trend Scout — Tier 3 shared specialist
// Monitors trending topics across platforms for content opportunities.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler, socialAnalyticsTool } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";

const searchTrends = createTool({
  id: "tavilySearch",
  description: "Search for trending topics from tracked competitor data",
  inputSchema: z.object({
    query: z.string().describe("Search query for trends"),
    platform: z.string().optional().describe("Filter by platform (youtube, tiktok, etc.)"),
  }),
  execute: async (executionContext) => {
    const { query, platform } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; platform?: string }) => {
        // Search tracked posts for trending content matching query
        const platformFilter = input.platform && input.platform !== "all"
          ? { creator: { platform: input.platform.toUpperCase() as never } }
          : {};

        const recentOutliers = await db.trackedPost.findMany({
          where: {
            isOutlier: true,
            ...platformFilter,
            publishedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
          },
          orderBy: { views: "desc" },
          take: 20,
          include: {
            creator: { select: { username: true, platform: true } },
          },
        });

        // Filter by query keywords (simple text match)
        const queryTerms = input.query.toLowerCase().split(/\s+/);
        const matched = recentOutliers.filter((p) => {
          const text = [p.title, p.url].filter(Boolean).join(" ").toLowerCase();
          return queryTerms.some((t) => text.includes(t));
        });

        const trends = (matched.length > 0 ? matched : recentOutliers.slice(0, 10)).map((p) => ({
          title: p.title,
          url: p.url,
          views: p.views,
          likes: p.likes,
          platform: p.creator.platform,
          creator: p.creator.username,
          publishedAt: p.publishedAt,
        }));

        return {
          query: input.query,
          platform: input.platform ?? "all",
          trends,
          source: "tracked_competitors",
        };
      },
      { agentName: "trend-scout", toolName: "tavilySearch" },
    );
    return wrappedFn({ query, platform });
  },
});

const searchTwitter = createTool({
  id: "searchTwitter",
  description: "Search Twitter/X tracked data for trending topics",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    timeframe: z.string().optional().describe("Time range: 1h, 24h, 7d"),
  }),
  execute: async (executionContext) => {
    const { query, timeframe } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; timeframe?: string }) => {
        const hours = input.timeframe === "1h" ? 1 : input.timeframe === "7d" ? 168 : 24;
        const since = new Date(Date.now() - hours * 3_600_000);

        const posts = await db.trackedPost.findMany({
          where: {
            creator: { platform: "X" as never },
            publishedAt: { gte: since },
          },
          orderBy: { likes: "desc" },
          take: 20,
          include: {
            creator: { select: { username: true } },
          },
        });

        return {
          query: input.query,
          timeframe: input.timeframe ?? "24h",
          tweets: posts.map((p) => ({
            text: p.title,
            url: p.url,
            likes: p.likes,
            comments: p.comments,
            views: p.views,
            author: p.creator.username,
            isOutlier: p.isOutlier,
          })),
          source: "tracked_x_creators",
        };
      },
      { agentName: "trend-scout", toolName: "searchTwitter" },
    );
    return wrappedFn({ query, timeframe });
  },
});

const searchHackerNews = createTool({
  id: "searchHackerNews",
  description: "Search Hacker News for trending tech topics via Algolia API",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    sortBy: z.enum(["relevance", "date", "points"]).optional().describe("Sort order"),
  }),
  execute: async (executionContext) => {
    const { query, sortBy } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; sortBy?: string }) => {
        try {
          // HN Algolia API — free, no API key needed
          const endpoint = input.sortBy === "date"
            ? "https://hn.algolia.com/api/v1/search_by_date"
            : "https://hn.algolia.com/api/v1/search";

          const params = new URLSearchParams({
            query: input.query,
            tags: "story",
            hitsPerPage: "15",
          });

          const response = await fetch(`${endpoint}?${params}`, {
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            return {
              query: input.query,
              sortBy: input.sortBy ?? "relevance",
              stories: [],
              error: `HN API returned ${response.status}`,
            };
          }

          const data = await response.json() as {
            hits: Array<{
              title: string;
              url: string;
              points: number;
              num_comments: number;
              objectID: string;
              created_at: string;
              author: string;
            }>;
          };

          let stories = data.hits.map((h) => ({
            title: h.title,
            url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
            points: h.points,
            comments: h.num_comments,
            author: h.author,
            publishedAt: h.created_at,
            hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
          }));

          // Sort by points if requested
          if (input.sortBy === "points") {
            stories = stories.sort((a, b) => b.points - a.points);
          }

          return {
            query: input.query,
            sortBy: input.sortBy ?? "relevance",
            stories,
            source: "hacker_news_algolia",
          };
        } catch (err) {
          return {
            query: input.query,
            sortBy: input.sortBy ?? "relevance",
            stories: [],
            error: err instanceof Error ? err.message : "HN search failed",
          };
        }
      },
      { agentName: "trend-scout", toolName: "searchHackerNews" },
    );
    return wrappedFn({ query, sortBy });
  },
});

const searchReddit = createTool({
  id: "searchReddit",
  description: "Search Reddit for trending discussions via JSON API",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    subreddit: z.string().optional().describe("Specific subreddit to search"),
  }),
  execute: async (executionContext) => {
    const { query, subreddit } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; subreddit?: string }) => {
        try {
          // Reddit JSON API — free, no API key needed
          const sub = input.subreddit && input.subreddit !== "all" ? input.subreddit : "all";
          const params = new URLSearchParams({
            q: input.query,
            sort: "relevance",
            t: "week",
            limit: "15",
          });

          const url = `https://www.reddit.com/r/${sub}/search.json?${params}&restrict_sr=${sub !== "all" ? "on" : "off"}`;

          const response = await fetch(url, {
            headers: { "User-Agent": "NexusSuite/1.0 (content-research)" },
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            return {
              query: input.query,
              subreddit: sub,
              posts: [],
              error: `Reddit API returned ${response.status}`,
            };
          }

          const data = await response.json() as {
            data: {
              children: Array<{
                data: {
                  title: string;
                  subreddit: string;
                  score: number;
                  num_comments: number;
                  url: string;
                  permalink: string;
                  created_utc: number;
                  author: string;
                  selftext: string;
                };
              }>;
            };
          };

          const posts = data.data.children.map((c) => ({
            title: c.data.title,
            subreddit: c.data.subreddit,
            score: c.data.score,
            comments: c.data.num_comments,
            url: `https://www.reddit.com${c.data.permalink}`,
            author: c.data.author,
            publishedAt: new Date(c.data.created_utc * 1000).toISOString(),
            preview: c.data.selftext?.slice(0, 200) || null,
          }));

          return {
            query: input.query,
            subreddit: sub,
            posts,
            source: "reddit_json_api",
          };
        } catch (err) {
          return {
            query: input.query,
            subreddit: input.subreddit ?? "all",
            posts: [],
            error: err instanceof Error ? err.message : "Reddit search failed",
          };
        }
      },
      { agentName: "trend-scout", toolName: "searchReddit" },
    );
    return wrappedFn({ query, subreddit });
  },
});

const AGENT_NAME = "trend-scout";

const INSTRUCTIONS = `You are the Trend Scout specialist. Your role is to identify trending topics, viral patterns, and content opportunities across platforms.

You can search for:
- Trending hashtags and topics
- Viral content patterns and formats
- Emerging niches and content gaps
- Competitor content performance signals

Return concise, actionable trend insights. Focus on timeliness and relevance to the creator's niche.`;

export const trendScoutAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { searchTrends, searchTwitter, searchHackerNews, searchReddit, socialAnalyticsTool },
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

  const result = await trendScoutAgent.generate(prompt, {
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
