import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
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

// Editing rules by content type and platform
const EDITING_RULES: Record<string, string[]> = {
  "post:general": [
    "Keep sentences under 20 words for readability",
    "Use active voice over passive voice",
    "Include a clear call-to-action",
    "Avoid jargon unless targeting expert audience",
    "Start with a hook — first line must grab attention",
  ],
  "post:tiktok": [
    "Keep total caption under 2200 characters",
    "Use 3-5 relevant hashtags, not more",
    "Front-load the hook in first line",
    "Use line breaks for readability",
    "Emojis: minimal (1-2 max)",
  ],
  "post:instagram": [
    "First line is the hook — most important",
    "Use line breaks and whitespace generously",
    "Up to 30 hashtags, mix branded + niche + trending",
    "Include a CTA: save, share, comment, or follow",
    "Emojis: moderate (3-5), use as bullet points",
  ],
  "post:x": [
    "Stay under 280 characters",
    "1-2 hashtags maximum",
    "No fluff — every word must earn its place",
    "Thread format for longer content: hook in first tweet",
    "Avoid links in main tweet if possible (lower reach)",
  ],
  "post:linkedin": [
    "Professional tone, avoid slang",
    "3-5 hashtags at end of post",
    "Use line breaks every 1-2 sentences",
    "Open with a bold statement or personal story",
    "End with a question to drive comments",
  ],
  "article:general": [
    "Use H2/H3 headers every 200-300 words",
    "Include a meta description under 160 characters",
    "Target keyword in title, first paragraph, and headers",
    "Use bullet points and numbered lists for scannability",
    "Internal links: 2-3 per 1000 words",
  ],
  "script:general": [
    "Hook must be in first 3 seconds",
    "Keep sentences short — written for speaking",
    "Include visual cues: [B-ROLL], [CUT TO], [ZOOM]",
    "CTA at natural pause point, not just at end",
    "Total script length should match target video duration",
  ],
  "caption:general": [
    "Lead with the most compelling phrase",
    "Match platform character limits",
    "Include relevant hashtags",
    "End with a question or CTA",
    "Proofread for typos — no autocorrect mistakes",
  ],
};

const QUALITY_THRESHOLDS: Record<string, { minimumScore: number; categoryMinimums: Record<string, number> }> = {
  draft: {
    minimumScore: 40,
    categoryMinimums: { grammar: 30, clarity: 30, engagement: 20, brand_alignment: 30, seo: 20 },
  },
  review: {
    minimumScore: 60,
    categoryMinimums: { grammar: 50, clarity: 50, engagement: 40, brand_alignment: 50, seo: 40 },
  },
  publish: {
    minimumScore: 70,
    categoryMinimums: { grammar: 60, clarity: 60, engagement: 50, brand_alignment: 65, seo: 50 },
  },
};

const getEditingRules = createTool({
  id: "getEditingRules",
  description: "Fetch editing rules and style guide for content evaluation",
  inputSchema: z.object({
    contentType: z.string().describe("Type of content: post, article, script, caption"),
    platform: z.string().optional().describe("Target platform"),
  }),
  execute: async (executionContext) => {
    const { contentType, platform } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { contentType: string; platform?: string }) => {
        const platformKey = input.platform?.toLowerCase() ?? "general";
        const specificRules = EDITING_RULES[`${input.contentType}:${platformKey}`] ?? [];
        const generalRules = EDITING_RULES[`${input.contentType}:general`] ?? [];

        // Merge: platform-specific rules first, then general (deduped)
        const rules = specificRules.length > 0
          ? [...specificRules, ...generalRules.filter((r) => !specificRules.includes(r))]
          : generalRules;

        return {
          contentType: input.contentType,
          platform: platformKey,
          rules,
        };
      },
      { agentName: AGENT_NAME, toolName: "getEditingRules" },
    );
    return wrappedFn({ contentType, platform });
  },
});

const getQualityThresholds = createTool({
  id: "getQualityThresholds",
  description: "Fetch minimum quality thresholds for content approval",
  inputSchema: z.object({
    contentType: z.string().describe("Type of content"),
    tier: z.enum(["draft", "review", "publish"]).optional().describe("Quality tier"),
  }),
  execute: async (executionContext) => {
    const { contentType, tier } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { contentType: string; tier?: string }) => {
        const tierKey = input.tier ?? "publish";
        const thresholds = QUALITY_THRESHOLDS[tierKey] ?? QUALITY_THRESHOLDS.publish;

        return {
          contentType: input.contentType,
          tier: tierKey,
          ...thresholds,
        };
      },
      { agentName: AGENT_NAME, toolName: "getQualityThresholds" },
    );
    return wrappedFn({ contentType, tier });
  },
});

const scoreContent = createTool({
  id: "scoreContent",
  description: "Score content quality on a 0-100 scale using heuristic analysis",
  inputSchema: z.object({
    content: z.string().describe("Content text to score"),
    contentType: z.string().describe("Type: post, article, script, caption"),
    platform: z.string().optional().describe("Target platform"),
  }),
  execute: async (executionContext) => {
    const { content, contentType, platform } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { content: string; contentType: string; platform?: string }) => {
        const text = input.content;
        const issues: string[] = [];
        const suggestions: string[] = [];

        // Grammar heuristics
        let grammarScore = 80;
        if (/\s{2,}/.test(text)) { grammarScore -= 10; issues.push("Multiple consecutive spaces detected"); }
        if (/[.!?]{3,}/.test(text)) { grammarScore -= 5; issues.push("Excessive punctuation"); }
        if (text !== text.trim()) { grammarScore -= 5; issues.push("Leading/trailing whitespace"); }
        const sentences = text.split(/[.!?]+/).filter(Boolean);
        const longSentences = sentences.filter((s) => s.split(/\s+/).length > 30);
        if (longSentences.length > 0) {
          grammarScore -= longSentences.length * 3;
          issues.push(`${longSentences.length} sentence(s) over 30 words`);
          suggestions.push("Break long sentences into shorter, punchier ones");
        }

        // Clarity heuristics
        let clarityScore = 75;
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const avgWordLength = text.replace(/\s+/g, "").length / Math.max(wordCount, 1);
        if (avgWordLength > 7) { clarityScore -= 10; suggestions.push("Use simpler words — average word length is high"); }
        if (wordCount < 10 && input.contentType !== "caption") { clarityScore -= 15; issues.push("Content is very short"); }

        // Engagement heuristics
        let engagementScore = 60;
        const hasQuestion = /\?/.test(text);
        const hasCta = /\b(comment|share|follow|subscribe|save|click|tap|link|dm|reply)\b/i.test(text);
        const hasEmoji = /[\u{1F000}-\u{1FFFF}]/u.test(text);
        const hasHook = text.split("\n")[0]!.length < 100;
        if (hasQuestion) engagementScore += 10;
        if (hasCta) engagementScore += 10;
        if (hasEmoji) engagementScore += 5;
        if (hasHook) engagementScore += 5;
        if (!hasCta) suggestions.push("Add a call-to-action to boost engagement");
        if (!hasQuestion) suggestions.push("End with a question to encourage comments");

        // Brand alignment (basic — no brand data in this context)
        const brandScore = 65;

        // SEO heuristics
        let seoScore = 50;
        const hasHashtags = /#\w+/.test(text);
        if (hasHashtags) seoScore += 15;
        if (wordCount > 50) seoScore += 10;
        if (text.includes("\n")) seoScore += 5; // structured content
        if (!hasHashtags && input.contentType !== "article") suggestions.push("Add relevant hashtags for discoverability");

        // Cap scores at 0-100
        const cap = (n: number) => Math.max(0, Math.min(100, n));
        const scores = {
          grammar: cap(grammarScore),
          clarity: cap(clarityScore),
          engagement: cap(engagementScore),
          brand_alignment: cap(brandScore),
          seo: cap(seoScore),
        };

        const overall = Math.round(
          scores.grammar * 0.2 + scores.clarity * 0.2 + scores.engagement * 0.25 +
          scores.brand_alignment * 0.2 + scores.seo * 0.15,
        );

        const threshold = 70;

        return {
          contentType: input.contentType,
          platform: input.platform ?? "general",
          overall_score: overall,
          scores,
          pass: overall >= threshold,
          threshold,
          issues,
          suggestions,
          wordCount,
        };
      },
      { agentName: AGENT_NAME, toolName: "scoreContent" },
    );
    return wrappedFn({ content, contentType, platform });
  },
});

const qualityScorerAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getEditingRules, getQualityThresholds, scoreContent },
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

  const result = await qualityScorerAgent.generate(prompt, {
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
