import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Hashtag Optimizer for Nexus Suite.

Single task: Research and select optimal hashtags for maximum reach.

Capabilities:
- Analyze trending hashtags per platform using CLI tools
- Mix branded, trending, and niche hashtags for optimal reach
- Enforce platform limits: IG 30 max, YT 15 max, TikTok 5-8 recommended, X 1-2, LinkedIn 3-5
- Track hashtag performance data

Output format:
Return JSON with:
- "hashtags": array of selected hashtags
- "categories": { branded: [], trending: [], niche: [] }
- "platform": target platform
- "reach_estimate": estimated reach per hashtag
- "recommended_count": optimal number for this platform`;

const AGENT_NAME = "hashtag-optimizer";

const hashtagOptimizerAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return hashtagOptimizerAgent;
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

  const result = await hashtagOptimizerAgent.generate(prompt, {
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
