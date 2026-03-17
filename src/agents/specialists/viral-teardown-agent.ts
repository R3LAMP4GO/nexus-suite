import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";

const AGENT_NAME = "viral-teardown-agent";

const INSTRUCTIONS = `You are the Viral Tear-down Agent for Nexus Suite.

Single task: Analyze viral content and generate a "Viral Recipe" report.

Capabilities:
- Extract transcripts from viral videos
- Analyze pacing, hook structure, retention curves
- Identify replicable patterns: format, topic selection, posting time
- Score virality factors: shareability, emotional trigger, novelty

Output format:
Return JSON with:
- "viral_recipe": structured breakdown of why the content went viral
- "hook_analysis": { type, text, retention_impact }
- "pacing": { avg_scene_length, cuts_per_minute, energy_curve }
- "replicable_elements": array of patterns that can be reused
- "virality_score": 0-100 virality potential rating
- "content_template": a template based on the viral content structure`;

const fetchViralContent = createTool({
  id: "fetchViralContent",
  description: "Fetch viral post data for analysis from tracked outlier posts",
  inputSchema: z.object({
    url: z.string().optional().describe("URL of viral content to analyze"),
    platform: z.string().optional().describe("Platform to search for viral content"),
    niche: z.string().optional().describe("Content niche to filter by"),
  }),
  execute: async (executionContext) => {
    const { url, platform, niche } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { url?: string; platform?: string; niche?: string }) => {
        // If URL provided, look for that specific post
        if (input.url) {
          const post = await db.trackedPost.findFirst({
            where: { url: input.url },
            include: {
              creator: { select: { username: true, platform: true, followerCount: true } },
              snapshots: { orderBy: { capturedAt: "desc" }, take: 10 },
            },
          });

          if (post) {
            return {
              url: input.url,
              platform: post.creator.platform,
              content: {
                title: post.title,
                views: post.views,
                likes: post.likes,
                comments: post.comments,
                creator: post.creator.username,
                creatorFollowers: post.creator.followerCount,
                isOutlier: post.isOutlier,
                outlierScore: post.outlierScore,
                analysis: post.analysis,
                publishedAt: post.publishedAt,
                growthCurve: post.snapshots.map((s) => ({
                  views: s.views,
                  likes: s.likes,
                  comments: s.comments,
                  capturedAt: s.capturedAt,
                })),
              },
            };
          }
        }

        // Otherwise fetch top outlier posts for the platform
        const whereClause: Record<string, unknown> = { isOutlier: true };
        if (input.platform && input.platform !== "all") {
          whereClause.creator = { platform: input.platform.toUpperCase() };
        }

        const outliers = await db.trackedPost.findMany({
          where: whereClause as never,
          orderBy: { views: "desc" },
          take: 10,
          include: {
            creator: { select: { username: true, platform: true, followerCount: true } },
          },
        });

        return {
          url: input.url ?? null,
          platform: input.platform ?? "all",
          niche: input.niche ?? "general",
          content: outliers.map((p) => ({
            title: p.title,
            url: p.url,
            views: p.views,
            likes: p.likes,
            comments: p.comments,
            creator: p.creator.username,
            creatorFollowers: p.creator.followerCount,
            platform: p.creator.platform,
            isOutlier: p.isOutlier,
            outlierScore: p.outlierScore,
            analysis: p.analysis,
            publishedAt: p.publishedAt,
          })),
        };
      },
      { agentName: AGENT_NAME, toolName: "fetchViralContent" },
    );
    return wrappedFn({ url, platform, niche });
  },
});

const viralTeardownAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { fetchViralContent },
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

  const result = await viralTeardownAgent.generate(prompt, {
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
