// X sub-agent: News Scout — Tier 2.5
// Finds trending news and topics relevant to the brand for X content.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { db } from "@/lib/db";
import { modelConfig } from "@/agents/platforms/model-config";

const searchTrendingNews = createTool({
  id: "searchTrendingNews",
  description: "Search trending news by industry or topic for X content opportunities",
  inputSchema: z.object({
    industry: z.string().describe("Industry or vertical to search (e.g. tech, finance, healthcare)"),
    topic: z.string().optional().describe("Specific topic or keyword to focus on"),
  }),
  execute: async (input) => {
    const { industry, topic } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { industry: string; topic?: string }) => {
        const industry = input.industry.toLowerCase();
        const topic = input.topic?.toLowerCase() ?? "";

        // Search tracked posts for trending content in this industry
        const searchTerms = [industry, topic].filter(Boolean);
        const trackedPosts = await db.trackedPost.findMany({
          where: {
            OR: searchTerms.map((term) => ({
              title: { contains: term, mode: "insensitive" as const },
            })),
            isOutlier: true,
          },
          orderBy: { views: "desc" },
          take: 10,
          select: {
            title: true,
            url: true,
            views: true,
            likes: true,
            comments: true,
            publishedAt: true,
            creator: { select: { username: true, platform: true } },
          },
        });

        // Generate content angles from trending posts
        const results = trackedPosts.map((p) => ({
          headline: p.title ?? "Untitled",
          url: p.url ?? "",
          engagement: {
            views: p.views,
            likes: p.likes,
            comments: p.comments,
            engagementRate: p.views > 0 ? ((p.likes + p.comments) / p.views * 100) : 0,
          },
          source: p.creator?.username ?? "unknown",
          platform: p.creator?.platform ?? "unknown",
          publishedAt: p.publishedAt?.toISOString() ?? null,
          suggestedAngle: p.views > 100000
            ? "High-visibility topic — offer a contrarian or deeper take"
            : "Emerging topic — be early with a strong opinion",
        }));

        return {
          industry: input.industry,
          topic: input.topic ?? "general",
          results,
          trendingCount: results.length,
          contentSuggestions: [
            `Hot take thread on the biggest ${industry} trend this week`,
            `"Most people in ${industry} think X, but actually Y" — contrarian post`,
            topic ? `Deep dive on ${topic}: what everyone is getting wrong` : `${industry} predictions for the next quarter`,
            `Quote-tweet the top post with your unique perspective`,
          ],
          timingSuggestion: "Post within 2-4 hours of a trending topic for maximum visibility. X rewards timeliness.",
        };
      },
      { agentName: "news-scout", toolName: "searchTrendingNews" },
    );
    return wrappedFn({ industry, topic });
  },
});

export const newsScoutAgent = new Agent({
  id: "news-scout",
  name: "news-scout",
  instructions: `You are a News Scout sub-agent for the X (Twitter) platform.

Your job is to identify trending news, topics, and conversations relevant to the brand.
Focus on:
- Breaking news in the brand's industry
- Trending hashtags and conversations
- Competitor activity and responses
- Opportunities for timely, relevant posts

Return structured findings with topic, relevance score, and suggested angle.`,
  model: modelConfig.tier25,
  tools: { searchTrendingNews },
});
