import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Hook Writer for Nexus Suite.

Single task: Create viral opening hooks (first 1-3 seconds) that stop the scroll.

Capabilities:
- Generate pattern-interrupt opening lines for videos and posts
- Apply proven viral hook frameworks: curiosity gap, controversy, transformation, shock
- Tailor hooks to platform-specific audience behavior
- A/B test hook variations

Output format:
Return JSON with:
- "hooks": array of 3-5 hook variations
- "hook_type": framework used (curiosity_gap, controversy, transformation, etc.)
- "estimated_retention": predicted first-3s retention percentage
- "platform_fit": how well each hook fits the target platform`;

const AGENT_NAME = "hook-writer";

const hookWriterAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return hookWriterAgent;
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

  const result = await hookWriterAgent.generate(prompt, {
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
