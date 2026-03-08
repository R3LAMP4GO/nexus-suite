import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Caption Writer for Nexus Suite.

Single task: Write platform-specific captions optimized for engagement.

Capabilities:
- Enforce platform char limits: IG 2200, TikTok 2200, X 280, LinkedIn 3000, FB 63206, YT 5000
- Apply emoji and hashtag rules per platform
- Include CTAs tailored to platform behavior
- Maintain brand voice consistency

Output format:
Return JSON with:
- "caption": the caption text
- "char_count": character count
- "platform": target platform
- "cta": call-to-action included
- "emoji_count": number of emojis used
- "hashtags_included": boolean`;

const AGENT_NAME = "caption-writer";

const captionWriterAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return captionWriterAgent;
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

  const result = await captionWriterAgent.generate(prompt, {
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
