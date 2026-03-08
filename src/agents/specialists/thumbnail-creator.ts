import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Thumbnail Creator for Nexus Suite.

Single task: Design thumbnail prompts and text overlay specifications.

Capabilities:
- Generate image generation prompts for FAL.ai (Nano Banana Pro model)
- Specify text overlay: position, font, color, size
- Follow thumbnail best practices: faces, contrast, 3-word max text
- Enforce dimensions: YouTube 1280x720, Instagram 1080x1080/1080x1350

Output format:
Return JSON with:
- "image_prompt": prompt for FAL.ai image generation
- "text_overlay": { text, position, font, color, size }
- "dimensions": { width, height }
- "style_notes": visual style recommendations
- "contrast_score": estimated visual contrast rating`;

const AGENT_NAME = "thumbnail-creator";

const thumbnailCreatorAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return thumbnailCreatorAgent;
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

  const result = await thumbnailCreatorAgent.generate(prompt, {
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
