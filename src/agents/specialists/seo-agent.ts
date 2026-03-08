import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the SEO Agent for Nexus Suite.

Single task: Keyword research + content optimization for search visibility.

Capabilities:
- Research high-volume, low-competition keywords for content topics
- Optimize titles, descriptions, and body text for target keywords
- Analyze competitor keyword strategies
- Suggest internal linking opportunities
- Generate meta descriptions and alt text

Output format:
Return JSON with:
- "primary_keyword": main target keyword
- "secondary_keywords": array of supporting keywords
- "keyword_density": recommended density percentage
- "title_suggestion": SEO-optimized title
- "meta_description": max 160 chars
- "optimization_notes": specific recommendations`;

const AGENT_NAME = "seo-agent";

const seoAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return seoAgent;
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

  const result = await seoAgent.generate(prompt, {
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
