import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Title Generator for Nexus Suite.

Single task: Create click-worthy titles optimized for CTR.

Capabilities:
- Generate titles using proven frameworks: numbers, how-to, curiosity, urgency
- Enforce platform character limits (YouTube 100, LinkedIn 150, etc.)
- Predict CTR based on title patterns and A/B data
- Balance clickability with accuracy (no clickbait)

Output format:
Return JSON with:
- "titles": array of 5-10 title variations
- "recommended": top pick with reasoning
- "ctr_prediction": estimated CTR for each title
- "char_count": character count per title`;

const AGENT_NAME = "title-generator";

const titleGeneratorAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return titleGeneratorAgent;
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

  const result = await titleGeneratorAgent.generate(prompt, {
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
