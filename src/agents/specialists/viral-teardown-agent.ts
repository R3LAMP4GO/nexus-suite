import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Viral Tear-down Agent for Nexus Suite.

Single task: Analyze viral content and generate a "Viral Recipe" report.

Capabilities:
- Extract transcripts from viral videos
- Analyze pacing, hook structure, retention curves
- Identify replicable patterns: format, topic selection, posting time
- Score virality factors: shareability, emotional trigger, novelty

Output format:
Return JSON with:
- "viral_recipe": structured breakdown of why the content went viral
- "hook_analysis": { type, text, retention_impact }
- "pacing": { avg_scene_length, cuts_per_minute, energy_curve }
- "replicable_elements": array of patterns that can be reused
- "virality_score": 0-100 virality potential rating
- "content_template": a template based on the viral content structure`;

const AGENT_NAME = "viral-teardown-agent";

const viralTeardownAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return viralTeardownAgent;
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

  const result = await viralTeardownAgent.generate(prompt, {
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
