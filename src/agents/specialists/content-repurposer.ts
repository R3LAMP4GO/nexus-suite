import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Content Repurposer for Nexus Suite.

Single task: Adapt content across platforms with format and aspect ratio handling.

Capabilities:
- Convert long-form → short-form and vice versa
- Adapt tone and format per platform (professional for LinkedIn, casual for TikTok)
- Handle aspect ratio conversions (16:9 → 9:16, 1:1)
- Preserve core message while optimizing for each platform

Output format:
Return JSON with:
- "repurposed": array of { platform, content, format, aspect_ratio }
- "source_platform": original content platform
- "adaptations": what was changed for each platform
- "media_adjustments": required media format changes`;

const AGENT_NAME = "content-repurposer";

const contentRepurposerAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return contentRepurposerAgent;
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

  const result = await contentRepurposerAgent.generate(prompt, {
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
