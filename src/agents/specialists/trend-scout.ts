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

const searchTrends = createTool({
  id: "tavilySearch",
  description: "Search for trending topics and viral content patterns",
  inputSchema: z.object({
    query: z.string().describe("Search query for trends"),
    platform: z.string().optional().describe("Filter by platform (youtube, tiktok, etc.)"),
  }),
  execute: async (executionContext) => {
    const { query, platform } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; platform?: string }) => ({
        query: input.query,
        platform: input.platform ?? "all",
        trends: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: "trend-scout", toolName: "tavilySearch" },
    );
    return wrappedFn({ query, platform });
  },
});

const searchTwitter = createTool({
  id: "searchTwitter",
  description: "Search Twitter/X for trending topics and viral posts",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    timeframe: z.string().optional().describe("Time range: 1h, 24h, 7d"),
  }),
  execute: async (executionContext) => {
    const { query, timeframe } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; timeframe?: string }) => ({
        query: input.query,
        timeframe: input.timeframe ?? "24h",
        tweets: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: "trend-scout", toolName: "searchTwitter" },
    );
    return wrappedFn({ query, timeframe });
  },
});

const searchHackerNews = createTool({
  id: "searchHackerNews",
  description: "Search Hacker News for trending tech topics",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    sortBy: z.enum(["relevance", "date", "points"]).optional().describe("Sort order"),
  }),
  execute: async (executionContext) => {
    const { query, sortBy } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; sortBy?: string }) => ({
        query: input.query,
        sortBy: input.sortBy ?? "relevance",
        stories: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: "trend-scout", toolName: "searchHackerNews" },
    );
    return wrappedFn({ query, sortBy });
  },
});

const searchReddit = createTool({
  id: "searchReddit",
  description: "Search Reddit for trending discussions and content ideas",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    subreddit: z.string().optional().describe("Specific subreddit to search"),
  }),
  execute: async (executionContext) => {
    const { query, subreddit } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; subreddit?: string }) => ({
        query: input.query,
        subreddit: input.subreddit ?? "all",
        posts: [] as string[],
        status: "pending-integration" as const,
      }),
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
