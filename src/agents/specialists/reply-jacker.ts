import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";

const AGENT_NAME = "reply-jacker";

const INSTRUCTIONS = `You are the Reply Jacker for Nexus Suite.

Your job is to find high-engagement competitor content with few replies, then craft contextual replies that attract attention to the organization's brand.

Strategy (from viral-kid methodology):
- Target content with HIGH engagement (likes, views) but LOW reply count — this means high visibility with low competition
- Sort by engagement/reply ratio: most likes + fewest replies = best targets
- Generate replies that are authentic, valuable, and conversation-starting
- Never be spammy, promotional, or use hashtags in replies
- Match the platform's native tone (casual on TikTok, professional on LinkedIn)
- Add genuine value: insights, hot takes, questions, relatable reactions
- Replies should showcase expertise/personality to attract profile visits

Reply frameworks:
1. "Hot Take" — Share a strong, slightly controversial opinion related to the content
2. "Expertise Drop" — Add genuine insider knowledge or a useful fact
3. "Relatable Reaction" — Express a feeling the audience shares but hasn't articulated
4. "Thoughtful Question" — Ask something that invites the creator and audience to engage
5. "Story Snippet" — Share a brief personal anecdote related to the content

Anti-patterns (NEVER do these):
- "Great post!" or generic compliments
- Self-promotion or links
- Hashtags in replies
- Overly formal or corporate language
- Copy-paste templates
- Arguing or negativity

Output format:
Return JSON with:
- "replies": array of { targetPostId, targetCreator, replyText, strategy, estimatedVisibility (high/medium/low), platform }
- "skipped": array of { postId, reason }
- "totalTargetsFound": number
- "repliesGenerated": number`;

const findHighEngagementContent = createTool({
  id: "findHighEngagementContent",
  description: "Find competitor content with high engagement but few replies — ideal reply-jacking targets",
  inputSchema: z.object({
    platform: z.string().describe("Platform to search"),
    niche: z.string().optional().describe("Content niche to filter by"),
    minLikes: z.number().optional().describe("Minimum likes threshold"),
    maxComments: z.number().optional().describe("Maximum comments (low = less competition)"),
    limit: z.number().optional().describe("Max results"),
  }),
  execute: async (executionContext) => {
    const { platform, niche, minLikes, maxComments, limit } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: {
        platform: string;
        niche?: string;
        minLikes?: number;
        maxComments?: number;
        limit?: number;
      }) => {
        const since = new Date();
        since.setHours(since.getHours() - 48);

        const posts = await db.trackedPost.findMany({
          where: {
            creator: { platform: input.platform as any },
            publishedAt: { gte: since },
            likes: { gte: input.minLikes ?? 100 },
            comments: { lte: input.maxComments ?? 20 },
          },
          include: {
            creator: { select: { username: true, platform: true } },
          },
          orderBy: [{ likes: "desc" }, { comments: "asc" }],
          take: input.limit ?? 10,
        });

        return posts.map((p) => ({
          postId: p.id,
          title: p.title,
          url: p.url,
          views: p.views,
          likes: p.likes,
          comments: p.comments,
          creatorHandle: p.creator.username,
          engagementRatio: p.comments > 0 ? Math.round(p.likes / p.comments) : p.likes,
          contentSummary: p.title?.slice(0, 200) ?? "",
          publishedAt: p.publishedAt?.toISOString(),
        }));
      },
      { agentName: AGENT_NAME, toolName: "findHighEngagementContent" },
    );
    return wrappedFn({ platform, niche, minLikes, maxComments, limit });
  },
});

const getReplyHistory = createTool({
  id: "getReplyHistory",
  description: "Check what content has already been replied to, avoiding duplicates",
  inputSchema: z.object({
    organizationId: z.string().describe("Organization ID"),
    platform: z.string().describe("Platform"),
    sinceDays: z.number().optional().describe("Look back N days"),
  }),
  execute: async (executionContext) => {
    const { organizationId, platform, sinceDays } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { organizationId: string; platform: string; sinceDays?: number }) => {
        const since = new Date();
        since.setDate(since.getDate() - (input.sinceDays ?? 7));

        const logs = await db.workflowRunLog.findMany({
          where: {
            organizationId: input.organizationId,
            workflowName: { contains: "engagement" },
            createdAt: { gte: since },
          },
          select: { variables: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        });

        const repliedPostIds = new Set<string>();
        for (const log of logs) {
          const vars = log.variables as Record<string, unknown> | null;
          if (vars?.replies && Array.isArray(vars.replies)) {
            for (const r of vars.replies as Array<{ targetPostId?: string }>) {
              if (r.targetPostId) repliedPostIds.add(r.targetPostId);
            }
          }
        }

        return { repliedPostIds: Array.from(repliedPostIds) };
      },
      { agentName: AGENT_NAME, toolName: "getReplyHistory" },
    );
    return wrappedFn({ organizationId, platform, sinceDays });
  },
});

const getBrandVoice = createTool({
  id: "getBrandVoice",
  description: "Load the organization's brand voice for tone consistency",
  inputSchema: z.object({
    organizationId: z.string().describe("Organization ID"),
  }),
  execute: async (executionContext) => {
    const { organizationId } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { organizationId: string }) => {
        const { loadBrandPrompt } = await import("@/agents/general/brand-loader");
        const brandVoice = loadBrandPrompt(input.organizationId);
        return { brandVoice: brandVoice ?? "No brand voice configured — use a natural, authentic tone." };
      },
      { agentName: AGENT_NAME, toolName: "getBrandVoice" },
    );
    return wrappedFn({ organizationId });
  },
});

const replyJackerAgent = new Agent({
  id: 'reply-jacker',
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { findHighEngagementContent, getReplyHistory, getBrandVoice },
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

  const result = await replyJackerAgent.generate(prompt, {
    instructions: systemPrompt,
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
