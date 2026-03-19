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
import { db } from "@/lib/db";

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
  execute: async (input) => {
    const { keyword, wordCount, niche } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { keyword: string; wordCount?: number; niche?: string }) => {
        const targetWords = input.wordCount ?? 1500;
        const niche = input.niche ?? "general";

        // Check tracked posts for what's working in this keyword space
        const relatedPosts = await db.trackedPost.findMany({
          where: {
            title: { contains: input.keyword, mode: "insensitive" },
            isOutlier: true,
          },
          orderBy: { views: "desc" },
          take: 5,
          select: { title: true, views: true, likes: true, analysis: true },
        });

        // Generate section count based on word count
        const sectionCount = Math.max(3, Math.min(8, Math.round(targetWords / 300)));

        const suggestedHeadings = [
          `What Is ${input.keyword}? (Introduction)`,
          `Why ${input.keyword} Matters in ${new Date().getFullYear()}`,
          ...Array.from({ length: sectionCount - 3 }, (_, i) => 
            `${input.keyword}: Key Insight #${i + 1}`
          ),
          `Common Mistakes with ${input.keyword}`,
          `How to Get Started with ${input.keyword}`,
          `Conclusion: Your ${input.keyword} Action Plan`,
        ];

        const outline = [
          `Introduction (${Math.round(targetWords * 0.1)} words) — Hook + thesis + what the reader will learn`,
          ...Array.from({ length: sectionCount - 2 }, (_, i) =>
            `Section ${i + 1} (${Math.round(targetWords * 0.7 / (sectionCount - 2))} words) — ${suggestedHeadings[i + 1] ?? 'Main point with examples'}`
          ),
          `Conclusion (${Math.round(targetWords * 0.1)} words) — Summary + CTA + next steps`,
        ];

        // Keyword density guidance based on word count
        const idealMentions = Math.round(targetWords * 0.015); // ~1.5% density

        return {
          keyword: input.keyword,
          targetWordCount: targetWords,
          niche,
          keywordDensity: {
            min: 1.0,
            max: 2.5,
            idealMentions,
            tip: `Mention "${input.keyword}" approximately ${idealMentions} times across ${targetWords} words`,
          },
          suggestedHeadings,
          outline,
          competitorInsights: relatedPosts.map((p) => ({
            title: p.title,
            views: p.views,
            engagement: p.views ? ((p.likes) / p.views) * 100 : 0,
          })),
          seoTips: [
            `Use "${input.keyword}" in H1, first paragraph, and at least 2 H2s`,
            "Include 2-3 internal links and 1-2 authoritative external links",
            "Add an FAQ section with 3-5 questions for featured snippet potential",
            "Use short paragraphs (2-3 sentences max) for readability",
            `Target ${targetWords} words — articles under 1000 words rarely rank for competitive terms`,
            "Include at least one image/graphic per 300 words",
          ],
        };
      },
      { agentName: AGENT_NAME, toolName: "getArticleOutline" },
    );
    return wrappedFn({ keyword, wordCount, niche });
  },
});

const articleWriterAgent = new Agent({
  id: AGENT_NAME,
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
    modelSettings: { maxOutputTokens: opts?.maxTokens },
  });

  return {
    text: result.text,
    usage: result.usage
      ? {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          model: opts?.model ?? "default",
        }
      : undefined,
    toolCalls: result.toolCalls?.map((tc) => ({
      name: tc.payload.toolName,
      args: tc.payload.args as Record<string, unknown>,
      result: undefined,
    })),
  };
}
