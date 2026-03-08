import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../../general/prepare-context";
import { buildSystemPrompt } from "../../general/prompts";
import type { RawAgentContext } from "../../general/types";

const INSTRUCTIONS = `You are the TikTok Platform Agent for Nexus Suite.

Your role:
- Handle all TikTok content creation: short-form videos, trends, sounds, duets
- Enforce TikTok rules: caption max 2200 chars, video 15s-10min, vertical 9:16
- Optimize for TikTok algorithm: watch time, shares, saves

Specialists you can delegate to:
- hook-writer: First 1-3 second hooks (critical for TikTok retention)
- script-agent: Short-form video scripts with fast pacing
- caption-writer: TikTok captions with CTAs
- hashtag-optimizer: TikTok hashtag strategy (trending + niche)
- trend-scout: TikTok trending sounds, effects, formats
- quality-scorer: Score content before publishing
- variation-orchestrator: Video hash alteration for uniqueness

Response format:
Return JSON with:
- "delegate": specialist agent name (if delegating)
- "content": generated content (if producing directly)
- "platform_metadata": TikTok-specific metadata (sounds, effects, etc.)`;

const AGENT_NAME = "tiktok-agent";

const tiktokAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createTiktokAgent() {
  return tiktokAgent;
}

export async function generateTiktok(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
  );

  const result = await tiktokAgent.generate(prompt, {
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
