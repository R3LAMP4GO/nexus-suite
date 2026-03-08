import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Trend Scout for Nexus Suite.

Single task: Discover trending topics across platforms and niches.

Capabilities:
- Monitor trending topics on X/Twitter, Reddit, HackerNews via CLI tools
- Use Tavily search for broader trend discovery
- Identify emerging trends before they peak
- Score trend relevance to the creator's niche

Output format:
Return JSON with:
- "trends": array of { topic, platform, velocity, relevance_score }
- "emerging": trends still growing (early stage)
- "peaking": trends at peak (act now)
- "declining": trends past peak (avoid)
- "recommended_action": what content to create for each trend`;

const AGENT_NAME = "trend-scout";

const trendScoutAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return trendScoutAgent;
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

  const result = await trendScoutAgent.generate(prompt, {
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
