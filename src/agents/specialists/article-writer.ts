// Article Writer — Tier 3 shared specialist
// Writes long-form SEO articles with keyword optimization.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const AGENT_NAME = "article-writer";

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

const getArticleOutline = createTool({
  id: "getArticleOutline",
  description: "Fetch SEO structure, keyword density targets, and outline templates for articles",
  inputSchema: z.object({
    keyword: z.string().describe("Primary target keyword"),
    wordCount: z.number().optional().describe("Target word count"),
    niche: z.string().optional().describe("Content niche for tailored outlines"),
  }),
  execute: async (executionContext) => {
    const { keyword, wordCount, niche } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { keyword: string; wordCount?: number; niche?: string }) => ({
        keyword: input.keyword,
        targetWordCount: input.wordCount ?? 1500,
        niche: input.niche ?? "general",
        keywordDensity: { min: 1.0, max: 2.5 },
        suggestedHeadings: [] as string[],
        outline: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getArticleOutline" },
    );
    return wrappedFn({ keyword, wordCount, niche });
  },
});

const articleWriterAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getArticleOutline },
});

export async function generate(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
    ctx.organizationId as string | undefined,
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
