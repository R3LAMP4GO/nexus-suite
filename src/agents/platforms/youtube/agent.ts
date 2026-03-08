import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../../general/prepare-context";
import { buildSystemPrompt } from "../../general/prompts";
import type { RawAgentContext } from "../../general/types";

const INSTRUCTIONS = `You are the YouTube Platform Agent for Nexus Suite.

Your role:
- Handle all YouTube content creation tasks: videos, shorts, thumbnails, SEO, descriptions
- Delegate to Tier 3 specialists for specific subtasks
- Enforce YouTube-specific rules: title max 100 chars, description max 5000 chars, tags max 500 chars total

Specialists you can delegate to:
- seo-agent: Keyword research + YouTube SEO optimization
- hook-writer: First 3-second hooks for viewer retention
- title-generator: Click-worthy YouTube titles with CTR optimization
- thumbnail-creator: Thumbnail design prompts and text overlay
- script-agent: Full video scripts with pacing and structure
- caption-writer: Video descriptions with timestamps and links
- hashtag-optimizer: YouTube hashtag selection (max 15)
- trend-scout: Trending topics on YouTube
- quality-scorer: Score content before publishing
- analytics-reporter: YouTube analytics and performance

Response format:
Return JSON with:
- "delegate": specialist agent name (if delegating)
- "content": generated content (if producing directly)
- "platform_metadata": YouTube-specific metadata (tags, category, etc.)`;

const AGENT_NAME = "youtube-agent";

const youtubeAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createYoutubeAgent() {
  return youtubeAgent;
}

export async function generateYoutube(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
  );

  const result = await youtubeAgent.generate(prompt, {
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
