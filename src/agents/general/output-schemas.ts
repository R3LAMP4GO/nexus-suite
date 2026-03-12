// Zod schemas for validating structured agent output.
// Each specialist agent has a defined output contract.
// Used by validateAgentOutput() after every generate() call.

import { z } from "zod";

export const scriptAgentSchema = z.object({
  hook: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
  title: z.string().optional(),
});

export const qualityScorerSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string(),
  pass: z.boolean(),
  issues: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional(),
});

export const hookWriterSchema = z.object({
  hooks: z.array(z.string().min(1)).min(1).max(10),
});

export const titleGeneratorSchema = z.object({
  titles: z.array(z.string().min(1)).min(1).max(10),
});

export const captionWriterSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string()).optional(),
});

export const trendScoutSchema = z.object({
  trends: z.array(
    z.object({
      title: z.string(),
      angle: z.string(),
      talkingPoints: z.array(z.string()).optional(),
    }),
  ).min(1),
});

export const analyticsReporterSchema = z.object({
  summary: z.string().min(1),
  metrics: z.record(z.string(), z.number()).optional(),
});

export const hashtagOptimizerSchema = z.object({
  hashtags: z.array(z.string().min(1)).min(1),
  reasoning: z.string().optional(),
});

export const threadWriterSchema = z.object({
  posts: z.array(z.string().min(1)).min(2),
});

export const contentRepurposerSchema = z.object({
  platform: z.string(),
  content: z.string().min(1),
  format: z.string().optional(),
});

export const engagementResponderSchema = z.object({
  replies: z.array(
    z.object({
      originalId: z.string().optional(),
      reply: z.string().min(1),
    }),
  ),
});

export const seoAgentSchema = z.object({
  primary_keyword: z.string().min(1),
  secondary_keywords: z.array(z.string()).min(1),
  keyword_density: z.number().optional(),
  title_suggestion: z.string().min(1),
  meta_description: z.string().max(160),
  optimization_notes: z.string().optional(),
});

export const thumbnailCreatorSchema = z.object({
  image_prompt: z.string().min(1),
  text_overlay: z.object({
    text: z.string(),
    position: z.string(),
    font: z.string().optional(),
    color: z.string().optional(),
    size: z.union([z.string(), z.number()]).optional(),
  }),
  dimensions: z.object({
    width: z.number(),
    height: z.number(),
  }),
  style_notes: z.string().optional(),
  contrast_score: z.number().optional(),
});

export const articleWriterSchema = z.object({
  article: z.string().min(1),
  word_count: z.number().min(1),
  headings: z.array(z.string()).optional(),
  primary_keyword: z.string().optional(),
  keyword_occurrences: z.number().optional(),
  internal_links: z.array(z.string()).optional(),
});

export const variationOrchestratorSchema = z.object({
  transforms: z.array(z.record(z.string(), z.unknown())).min(1),
  variations_count: z.number().min(1),
  hash_strategy: z.string().min(1),
  quality_impact: z.number().min(0).max(100).optional(),
  ffmpeg_command: z.string().optional(),
});

export const brandPersonaAgentSchema = z.object({
  brand_prompt: z.string().min(1),
  voice_attributes: z.object({
    tone: z.string(),
    formality: z.string().optional(),
    vocabulary_level: z.string().optional(),
    personality_traits: z.array(z.string()).optional(),
  }),
  do: z.array(z.string()).min(1),
  dont: z.array(z.string()).min(1),
  example_phrases: z.array(z.string()).optional(),
});

export const viralTeardownAgentSchema = z.object({
  viral_recipe: z.string().min(1),
  hook_analysis: z.object({
    type: z.string(),
    text: z.string().optional(),
    retention_impact: z.string().optional(),
  }),
  pacing: z.object({
    avg_scene_length: z.union([z.string(), z.number()]).optional(),
    cuts_per_minute: z.number().optional(),
    energy_curve: z.string().optional(),
  }).optional(),
  replicable_elements: z.array(z.string()).min(1),
  virality_score: z.number().min(0).max(100),
  content_template: z.string().optional(),
});

// Map agent names to their output schemas
export const AGENT_OUTPUT_SCHEMAS: Record<string, z.ZodType> = {
  "script-agent": scriptAgentSchema,
  "quality-scorer": qualityScorerSchema,
  "hook-writer": hookWriterSchema,
  "title-generator": titleGeneratorSchema,
  "caption-writer": captionWriterSchema,
  "trend-scout": trendScoutSchema,
  "analytics-reporter": analyticsReporterSchema,
  "hashtag-optimizer": hashtagOptimizerSchema,
  "thread-writer": threadWriterSchema,
  "content-repurposer": contentRepurposerSchema,
  "engagement-responder": engagementResponderSchema,
  "seo-agent": seoAgentSchema,
  "thumbnail-creator": thumbnailCreatorSchema,
  "article-writer": articleWriterSchema,
  "variation-orchestrator": variationOrchestratorSchema,
  "brand-persona-agent": brandPersonaAgentSchema,
  "viral-teardown-agent": viralTeardownAgentSchema,
};
