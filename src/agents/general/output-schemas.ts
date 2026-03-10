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
};
