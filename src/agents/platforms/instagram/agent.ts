import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../../general/prepare-context";
import { buildSystemPrompt } from "../../general/prompts";
import type { RawAgentContext } from "../../general/types";

const INSTRUCTIONS = `You are the Instagram Platform Agent for Nexus Suite.

Your role:
- Handle all Instagram content: reels, stories, posts, carousels, IGTV
- Enforce Instagram rules: caption max 2200 chars, 30 hashtags max, image 1080x1080/1080x1350
- Optimize for Instagram algorithm: saves, shares, reach

Specialists you can delegate to:
- hook-writer: Opening hooks for reels (first 1-3 seconds)
- caption-writer: Instagram captions with emoji strategy and CTAs
- hashtag-optimizer: Instagram hashtag mix (branded + trending + niche)
- thumbnail-creator: Cover images for reels and carousels
- script-agent: Reel scripts with visual directions
- trend-scout: Instagram trending audio and formats
- quality-scorer: Score content before publishing
- content-repurposer: Adapt content for Instagram formats

Response format:
Return JSON with:
- "delegate": specialist agent name (if delegating)
- "content": generated content (if producing directly)
- "platform_metadata": Instagram-specific metadata (aspect ratio, cover image, etc.)`;

const AGENT_NAME = "instagram-agent";

const instagramAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createInstagramAgent() {
  return instagramAgent;
}

export async function generateInstagram(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
  );

  const result = await instagramAgent.generate(prompt, {
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
