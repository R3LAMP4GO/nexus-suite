// Thread Writer — Tier 3 shared specialist
// Creates multi-post threads with narrative arc and engagement hooks.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const AGENT_NAME = "thread-writer";

const INSTRUCTIONS = `You are the Thread Writer for Nexus Suite.

Single task: Create multi-post threads with narrative arc and engagement hooks.

Capabilities:
- Break long-form content into threaded posts (X threads, LinkedIn carousels)
- Apply narrative templates: listicle, story arc, educational breakdown
- Chunk content to platform limits while maintaining flow
- Add engagement hooks between posts (cliffhangers, questions)

Output format:
Return JSON with:
- "posts": array of { index, content, char_count }
- "total_posts": number of posts in thread
- "narrative_type": template used
- "engagement_hooks": hooks placed between posts
- "estimated_read_time": total read time in seconds`;

const getThreadStructure = createTool({
  id: "getThreadStructure",
  description: "Fetch thread length limits, hook placement patterns, and CTA templates",
  inputSchema: z.object({
    platform: z.string().describe("Target platform (x, linkedin, threads)"),
    narrativeType: z.enum(["listicle", "story", "educational"]).optional().describe("Narrative template"),
    postCount: z.number().optional().describe("Target number of posts"),
  }),
  execute: async (executionContext) => {
    const { platform, narrativeType, postCount } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; narrativeType?: string; postCount?: number }) => {
        const THREAD_CONFIG: Record<string, { charLimit: number; maxPosts: number; mediaPerPost: number; linkBehavior: string }> = {
          x: { charLimit: 280, maxPosts: 25, mediaPerPost: 4, linkBehavior: "shortens via t.co" },
          linkedin: { charLimit: 3000, maxPosts: 1, mediaPerPost: 9, linkBehavior: "inline, penalised in feed" },
          threads: { charLimit: 500, maxPosts: 10, mediaPerPost: 10, linkBehavior: "inline" },
        };

        const NARRATIVE_TEMPLATES: Record<string, { hookPlacement: string[]; structure: string[]; ctaPatterns: string[] }> = {
          listicle: {
            hookPlacement: ["Post 1: bold claim or stat", "Post 1: 'X things I learned about...'"],
            structure: ["Hook → numbered items (1 per post) → summary + CTA"],
            ctaPatterns: ["Follow for more [topic]", "Save this thread", "Which one resonated most? Reply below"],
          },
          story: {
            hookPlacement: ["Post 1: tension or conflict opener", "Post 1: 'A year ago I was...'"],
            structure: ["Setup (1-2 posts) → Rising action (3-5 posts) → Climax (1 post) → Resolution + lesson (1-2 posts)"],
            ctaPatterns: ["If this resonated, repost it", "Share your own story below", "Follow for the next chapter"],
          },
          educational: {
            hookPlacement: ["Post 1: myth-busting or 'most people think X, but actually Y'", "Post 1: question the reader wants answered"],
            structure: ["Question/myth → evidence/explanation (2-4 posts) → actionable takeaway (1-2 posts) → CTA"],
            ctaPatterns: ["Bookmark this for later", "Tag someone who needs this", "Follow for daily [topic] breakdowns"],
          },
        };

        const platformKey = input.platform.toLowerCase();
        const config = THREAD_CONFIG[platformKey] ?? THREAD_CONFIG.x;
        const narrative = input.narrativeType ?? "listicle";
        const template = NARRATIVE_TEMPLATES[narrative] ?? NARRATIVE_TEMPLATES.listicle;
        const targetPosts = Math.min(input.postCount ?? 7, config.maxPosts);

        return {
          platform: input.platform,
          narrativeType: narrative,
          maxPostCount: targetPosts,
          charLimit: config.charLimit,
          mediaPerPost: config.mediaPerPost,
          linkBehavior: config.linkBehavior,
          hookPlacements: template.hookPlacement,
          structure: template.structure,
          ctaPatterns: template.ctaPatterns,
          tips: [
            `Keep each post under ${Math.round(config.charLimit * 0.85)} chars for readability`,
            "End post 1 with '🧵👇' or 'A thread:' to signal thread format",
            "Number posts (1/, 2/, ...) so readers know progress",
            targetPosts > 5 ? "For long threads, add a mid-thread re-hook at post " + Math.ceil(targetPosts / 2) : "Short threads should be tight — every post must earn its place",
          ],
        };
      },
      { agentName: AGENT_NAME, toolName: "getThreadStructure" },
    );
    return wrappedFn({ platform, narrativeType, postCount });
  },
});

const threadWriterAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getThreadStructure },
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

  const result = await threadWriterAgent.generate(prompt, {
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
