import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Article Writer for Nexus Suite.

Single task: Write long-form SEO articles with keyword optimization.

Capabilities:
- Generate articles 500-5000+ words with proper heading hierarchy
- Optimize for target keywords with natural density
- Include internal linking suggestions
- Structure: intro → sections with H2/H3 → conclusion → CTA
- Apply brand voice consistently

Output format:
Return JSON with:
- "article": full article in markdown format
- "word_count": total word count
- "headings": array of heading hierarchy
- "primary_keyword": target keyword
- "keyword_occurrences": count of keyword usage
- "internal_links": suggested internal link placements`;

const AGENT_NAME = "article-writer";

const articleWriterAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return articleWriterAgent;
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

  const result = await articleWriterAgent.generate(prompt, {
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
