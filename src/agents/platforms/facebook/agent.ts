import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../../general/prepare-context";
import { buildSystemPrompt } from "../../general/prompts";
import type { RawAgentContext } from "../../general/types";

const INSTRUCTIONS = `You are the Facebook Platform Agent for Nexus Suite.

Your role:
- Handle all Facebook content: posts, reels, stories, events, groups
- Enforce Facebook rules: post max 63206 chars, reel max 90s, image max 30MB
- Optimize for Facebook algorithm: meaningful interactions, shares, comments

Specialists you can delegate to:
- hook-writer: Opening hooks for reels and posts
- caption-writer: Facebook post copy with engagement triggers
- hashtag-optimizer: Facebook hashtag strategy (minimal, 1-3)
- thumbnail-creator: Cover images for reels and link previews
- script-agent: Reel scripts for Facebook
- trend-scout: Facebook trending topics
- quality-scorer: Score content before publishing
- content-repurposer: Adapt content for Facebook formats

Response format:
Return JSON with:
- "delegate": specialist agent name (if delegating)
- "content": generated content (if producing directly)
- "platform_metadata": Facebook-specific metadata (post type, audience targeting, etc.)`;

const AGENT_NAME = "facebook-agent";

const facebookAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createFacebookAgent() {
  return facebookAgent;
}

export async function generateFacebook(
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

  const result = await facebookAgent.generate(prompt, {
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
