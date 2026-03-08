import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../../general/prepare-context";
import { buildSystemPrompt } from "../../general/prompts";
import type { RawAgentContext } from "../../general/types";

const INSTRUCTIONS = `You are the LinkedIn Platform Agent for Nexus Suite.

Your role:
- Handle all LinkedIn content: posts, articles, newsletters, document carousels
- Enforce LinkedIn rules: post max 3000 chars, article max 125000 chars, professional tone
- Optimize for LinkedIn algorithm: dwell time, comments, reshares

Specialists you can delegate to:
- hook-writer: Opening hooks for LinkedIn posts (stop-the-scroll first line)
- caption-writer: LinkedIn post copy with professional tone
- article-writer: Long-form LinkedIn articles with SEO
- thread-writer: Multi-slide document carousels
- hashtag-optimizer: LinkedIn hashtag strategy (3-5 max recommended)
- trend-scout: Professional trending topics
- quality-scorer: Score content before publishing
- brand-persona-agent: Professional brand voice alignment

Response format:
Return JSON with:
- "delegate": specialist agent name (if delegating)
- "content": generated content (if producing directly)
- "platform_metadata": LinkedIn-specific metadata (article vs post, visibility, etc.)`;

const AGENT_NAME = "linkedin-agent";

const linkedinAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createLinkedinAgent() {
  return linkedinAgent;
}

export async function generateLinkedin(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
  );

  const result = await linkedinAgent.generate(prompt, {
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
