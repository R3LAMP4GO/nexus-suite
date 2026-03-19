import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler, socialPostTool } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";

const AGENT_NAME = "engagement-responder";

const INSTRUCTIONS = `You are the Engagement Responder for Nexus Suite.

Single task: Reply to comments and mentions with on-brand responses.

Capabilities:
- Analyze comment sentiment (positive, negative, neutral, spam)
- Generate contextual replies that maintain brand voice
- Apply reply templates for common scenarios (thanks, FAQ, complaints)
- Prioritize high-engagement comments for reply

Output format:
Return JSON with:
- "reply": the response text
- "sentiment": detected sentiment of original comment
- "priority": reply priority (high, medium, low)
- "template_used": which reply template was applied
- "escalate": boolean if human review needed`;

const getRecentComments = createTool({
  id: "getRecentComments",
  description: "Fetch comments and mentions needing response",
  inputSchema: z.object({
    platform: z.string().describe("Platform to fetch comments from"),
    limit: z.number().optional().describe("Max comments to return"),
    unrespondedOnly: z.boolean().optional().describe("Only fetch unresponded comments"),
  }),
  execute: async (input) => {
    const { platform, limit, unrespondedOnly } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; limit?: number; unrespondedOnly?: boolean }) => {
        const resultLimit = input.limit ?? 50;
        const platformUpper = input.platform.toUpperCase();

        // Fetch recent posts with their engagement data
        const recentPosts = await db.postRecord.findMany({
          where: {
            platform: platformUpper as any,
            status: "SUCCESS",
            postedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
          },
          orderBy: { postedAt: "desc" },
          take: 20,
          select: {
            id: true,
            externalPostId: true,
            caption: true,
            postedAt: true,
            platform: true,
          },
        });

        // Fetch metric snapshots for these posts
        const postIds = recentPosts.map((p) => p.id);
        const allSnapshots = postIds.length > 0
          ? await db.postMetricSnapshot.findMany({
              where: { postRecordId: { in: postIds } },
              orderBy: { snapshotAt: "desc" },
              distinct: ["postRecordId"],
              select: { postRecordId: true, views: true, likes: true, comments: true, shares: true },
            })
          : [];
        const snapMap = new Map(allSnapshots.map((s) => [s.postRecordId, s]));

        // Build comment-like records from posts that have engagement
        const comments = recentPosts
          .filter((p) => {
            const snap = snapMap.get(p.id);
            return snap && snap.comments > 0;
          })
          .map((p) => {
            const snap = snapMap.get(p.id);
            return {
              postRecordId: p.id,
              externalPostId: p.externalPostId,
              platform: p.platform,
              caption: p.caption?.slice(0, 100) ?? "",
              postedAt: p.postedAt?.toISOString() ?? null,
              commentCount: snap?.comments ?? 0,
              likeCount: snap?.likes ?? 0,
              viewCount: snap?.views ?? 0,
              engagementRate: snap && snap.views ? ((snap.likes + snap.comments) / snap.views) * 100 : 0,
              priority: snap && snap.comments > 10 ? "high" : snap && snap.comments > 3 ? "medium" : "low",
              needsResponse: true,
            };
          })
          .slice(0, resultLimit);

        return {
          platform: input.platform,
          limit: resultLimit,
          unrespondedOnly: input.unrespondedOnly ?? true,
          comments,
          totalPosts: recentPosts.length,
          postsWithComments: comments.length,
          highPriority: comments.filter((c) => c.priority === "high").length,
        };
      },
      { agentName: AGENT_NAME, toolName: "getRecentComments" },
    );
    return wrappedFn({ platform, limit, unrespondedOnly });
  },
});

const engagementResponderAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getRecentComments, socialPostTool },
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

  const result = await engagementResponderAgent.generate(prompt, {
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
