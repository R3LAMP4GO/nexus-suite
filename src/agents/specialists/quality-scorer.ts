import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Quality Scorer for Nexus Suite.

Single task: Score content quality before distribution, enforce quality thresholds.

Capabilities:
- Score content on: grammar, clarity, engagement potential, brand alignment, SEO
- Apply editing rules and style guides
- Flag content below quality thresholds for revision
- Provide specific improvement suggestions

Output format:
Return JSON with:
- "overall_score": 0-100 quality score
- "scores": { grammar, clarity, engagement, brand_alignment, seo }
- "pass": boolean (true if above threshold)
- "threshold": minimum required score
- "issues": array of specific problems found
- "suggestions": array of improvement recommendations`;

const AGENT_NAME = "quality-scorer";

const qualityScorerAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return qualityScorerAgent;
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

  const result = await qualityScorerAgent.generate(prompt, {
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
