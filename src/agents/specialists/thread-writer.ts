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
      async (input: { platform: string; narrativeType?: string; postCount?: number }) => ({
        platform: input.platform,
        narrativeType: input.narrativeType ?? "listicle",
        maxPostCount: input.postCount ?? 10,
        charLimit: 280,
        hookPlacements: [] as string[],
        ctaPatterns: [] as string[],
        status: "pending-integration" as const,
      }),
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

export function createAgent() {
  return threadWriterAgent;
}

export async function generate(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
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
