import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler, socialAnalyticsTool } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";

const AGENT_NAME = "analytics-reporter";

const INSTRUCTIONS = `You are the Analytics Reporter for Nexus Suite.

Single task: Generate performance reports with trend detection and insights.

Capabilities:
- Query analytics data across platforms
- Detect performance trends (growth, decline, anomalies)
- Compare content performance across time periods
- Generate actionable insights and recommendations

Output format:
Return JSON with:
- "summary": executive summary of performance
- "metrics": { impressions, engagement_rate, reach, clicks, conversions }
- "trends": array of { metric, direction, magnitude, period }
- "top_content": best performing content in period
- "recommendations": array of actionable next steps`;

function parsePeriodDays(period: string): number {
  const match = period.match(/^(\d+)d$/);
  return match ? parseInt(match[1], 10) : 30;
}

const queryAnalytics = createTool({
  id: "queryAnalytics",
  description: "Fetch engagement, reach, and follower data by platform and time period",
  inputSchema: z.object({
    platform: z.string().describe("Platform to query (youtube, tiktok, instagram, etc.)"),
    period: z.string().optional().describe("Time period: 7d, 30d, 90d"),
    metrics: z.array(z.string()).optional().describe("Specific metrics to fetch"),
  }),
  execute: async (input) => {
    const { platform, period, metrics } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; period?: string; metrics?: string[] }) => {
        const days = parsePeriodDays(input.period ?? "30d");
        const since = new Date(Date.now() - days * 86_400_000);
        const platformUpper = input.platform.toUpperCase();

        // Fetch post records for the platform in the time range
        const postRecords = await db.postRecord.findMany({
          where: {
            platform: platformUpper as never,
            status: "SUCCESS",
            postedAt: { gte: since },
          },
          orderBy: { postedAt: "desc" },
          take: 500,
        });

        // Fetch tracked posts (competitor data) for engagement benchmarks
        const trackedPosts = await db.trackedPost.findMany({
          where: {
            creator: { platform: platformUpper as never },
            publishedAt: { gte: since },
          },
          orderBy: { views: "desc" },
          take: 100,
        });

        const totalPosts = postRecords.length;
        const totalTrackedViews = trackedPosts.reduce((s, p) => s + p.views, 0);
        const totalTrackedLikes = trackedPosts.reduce((s, p) => s + p.likes, 0);
        const totalTrackedComments = trackedPosts.reduce((s, p) => s + p.comments, 0);
        const avgEngagement = totalTrackedViews > 0
          ? ((totalTrackedLikes + totalTrackedComments) / totalTrackedViews) * 100
          : 0;

        // Top content: highest-viewed tracked posts
        const topContent = trackedPosts.slice(0, 5).map((p) => ({
          title: p.title,
          url: p.url,
          views: p.views,
          likes: p.likes,
          comments: p.comments,
          isOutlier: p.isOutlier,
        }));

        // Simple trend: compare first half vs second half of period
        const midpoint = new Date(since.getTime() + (Date.now() - since.getTime()) / 2);
        const firstHalf = trackedPosts.filter((p) => p.publishedAt && p.publishedAt < midpoint);
        const secondHalf = trackedPosts.filter((p) => p.publishedAt && p.publishedAt >= midpoint);

        const firstAvgViews = firstHalf.length > 0 ? firstHalf.reduce((s, p) => s + p.views, 0) / firstHalf.length : 0;
        const secondAvgViews = secondHalf.length > 0 ? secondHalf.reduce((s, p) => s + p.views, 0) / secondHalf.length : 0;
        const viewsTrend = firstAvgViews > 0 ? ((secondAvgViews - firstAvgViews) / firstAvgViews) * 100 : 0;

        return {
          platform: input.platform,
          period: input.period ?? "30d",
          metrics: input.metrics ?? ["impressions", "engagement_rate", "reach"],
          data: {
            totalOwnPosts: totalPosts,
            trackedPostsAnalyzed: trackedPosts.length,
            totalViews: totalTrackedViews,
            totalLikes: totalTrackedLikes,
            totalComments: totalTrackedComments,
            avgEngagementRate: Math.round(avgEngagement * 100) / 100,
            viewsTrendPercent: Math.round(viewsTrend * 100) / 100,
            topContent,
          },
        };
      },
      { agentName: AGENT_NAME, toolName: "queryAnalytics" },
    );
    return wrappedFn({ platform, period, metrics });
  },
});

const analyticsReporterAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { queryAnalytics, socialAnalyticsTool },
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

  const result = await analyticsReporterAgent.generate(prompt, {
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
