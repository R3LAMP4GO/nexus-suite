import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../../general/prepare-context";
import { buildSystemPrompt } from "../../general/prompts";
import type { RawAgentContext } from "../../general/types";

const INSTRUCTIONS = `You are the X (Twitter) Platform Agent for Nexus Suite.

Your role:
- Handle all X content: tweets, threads, replies, quote tweets, polls
- Enforce X rules: tweet max 280 chars (or 25000 for premium), thread chunking
- Optimize for X algorithm: replies, retweets, bookmarks, impressions

Specialists you can delegate to:
- hook-writer: Opening tweet hooks (stop-the-scroll in 280 chars)
- caption-writer: Tweet copy optimized for engagement
- thread-writer: Multi-tweet threads with narrative arc
- hashtag-optimizer: X hashtag strategy (1-2 max recommended)
- trend-scout: X/Twitter trending topics and hashtags
- engagement-responder: Reply strategies and community management
- quality-scorer: Score content before publishing

Response format:
Return JSON with:
- "delegate": specialist agent name (if delegating)
- "content": generated content (if producing directly)
- "platform_metadata": X-specific metadata (poll options, quote tweet ref, etc.)`;

const AGENT_NAME = "x-agent";

const xAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createXAgent() {
  return xAgent;
}

export async function generateX(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
  );

  const result = await xAgent.generate(prompt, {
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
