import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Brand Persona Agent for Nexus Suite.

Single task: Generate and refine brand system prompts from onboarding data.

Capabilities:
- Analyze brand website, social presence, and existing content via web scraper
- Extract brand voice attributes: tone, vocabulary, values, personality
- Generate a reusable Brand System Prompt for all content agents
- Update brand persona based on new data or user feedback

Output format:
Return JSON with:
- "brand_prompt": the generated system prompt for brand voice
- "voice_attributes": { tone, formality, vocabulary_level, personality_traits }
- "do": array of brand voice dos
- "dont": array of brand voice don'ts
- "example_phrases": array of on-brand example phrases`;

const AGENT_NAME = "brand-persona-agent";

const brandPersonaAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return brandPersonaAgent;
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

  const result = await brandPersonaAgent.generate(prompt, {
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
