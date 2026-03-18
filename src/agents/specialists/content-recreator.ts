import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";

const AGENT_NAME = "content-recreator";

const INSTRUCTIONS = `You are the Content Recreator for Nexus Suite.

Your job is to take viral content analysis (transcripts, teardowns, clip data) and recreate original scripts that capture the same viral mechanics without copying the content. You are the bridge between "what worked" and "make something new that works the same way."

Core recreation principles:
1. **Extract the pattern, not the content** — Identify WHY something went viral (hook structure, pacing, emotional arc) and recreate those mechanics with original content
2. **Brand voice injection** — Every recreation must sound like the brand, not the original creator
3. **Hook transposition** — Take the hook TYPE (question, bold claim, pattern interrupt) and write a new one in the brand's voice
4. **Pacing mirror** — Match the original's sentence length, pause timing, and energy transitions
5. **CTA reinvention** — Adapt the call-to-action style (soft sell, engagement bait, controversy) to the brand's goals

Recreation types:
- "mirror" — Same structure, different topic/angle (closest to original)
- "transpose" — Same emotional arc, different format (e.g. monologue → skit)
- "extract" — Pull one technique (hook, pacing, CTA) and build around it
- "mashup" — Combine elements from 2-3 viral sources into one original piece

Output format:
Return JSON with:
- "scripts": array of {
    type ("mirror" | "transpose" | "extract" | "mashup"),
    hook, body, cta,
    estimatedDuration (seconds),
    targetPlatforms (array),
    viralMechanics (what viral elements were used),
    differentiators (what makes this original)
  }
- "sourceAnalysis": { hookType, pacingStyle, emotionalArc, ctaStyle }
- "confidence": number (0-1, how likely to replicate viral performance)`;

const getViralPatterns = createTool({
  id: "getViralPatterns",
  description: "Look up recent viral content patterns and teardowns from the database for a specific niche or platform",
  inputSchema: z.object({
    organizationId: z.string().describe("Organization ID"),
    platform: z.string().optional().describe("Filter by platform"),
    limit: z.number().default(10).describe("Number of patterns to retrieve"),
  }),
  execute: async (executionContext) => {
    const { organizationId, platform, limit } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { organizationId: string; platform?: string; limit: number }) => {
        // Look up tracked viral posts with high performance metrics
        // TrackedPost belongs to TrackedCreator which has organizationId + platform
        const creatorWhere: Record<string, unknown> = {
          organizationId: input.organizationId,
        };
        if (input.platform) creatorWhere.platform = input.platform;

        const viralPosts = await db.trackedPost.findMany({
          where: { creator: creatorWhere } as any,
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          select: {
            id: true,
            externalId: true,
            title: true,
            url: true,
            views: true,
            likes: true,
            comments: true,
            isOutlier: true,
            outlierScore: true,
            analysis: true,
            creator: {
              select: { platform: true, username: true },
            },
          },
        });

        return {
          patterns: viralPosts.map((p) => {
            const analysis = p.analysis as Record<string, unknown> | null;
            return {
              id: p.id,
              platform: p.creator.platform,
              creator: p.creator.username,
              title: p.title,
              url: p.url,
              views: p.views,
              likes: p.likes,
              comments: p.comments,
              isOutlier: p.isOutlier,
              outlierScore: p.outlierScore,
              hookText: analysis?.hookText ?? null,
              teardownNotes: analysis?.teardownNotes ?? null,
            };
          }),
          count: viralPosts.length,
        };
      },
      { agentName: AGENT_NAME, toolName: "getViralPatterns" },
    );
    return wrappedFn({ organizationId, platform, limit });
  },
});

const getBrandContext = createTool({
  id: "getBrandContext",
  description: "Fetch the brand voice, persona, and content guidelines for the organization",
  inputSchema: z.object({
    organizationId: z.string().describe("Organization ID"),
  }),
  execute: async (executionContext) => {
    const { organizationId } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { organizationId: string }) => {
        const org = await db.organization.findUnique({
          where: { id: input.organizationId },
          select: { name: true, brandConfig: true },
        });

        if (!org) throw new Error(`Organization ${input.organizationId} not found`);

        const config = org.brandConfig as Record<string, unknown> | null;

        return {
          name: org.name,
          voice: config?.voice ?? config?.brandVoice ?? null,
          persona: config?.persona ?? null,
          contentPillars: config?.contentPillars ?? [],
          avoidTopics: config?.avoidTopics ?? [],
          toneKeywords: config?.toneKeywords ?? [],
          targetAudience: config?.targetAudience ?? null,
        };
      },
      { agentName: AGENT_NAME, toolName: "getBrandContext" },
    );
    return wrappedFn({ organizationId });
  },
});

const saveRecreatedScript = createTool({
  id: "saveRecreatedScript",
  description: "Save a recreated script to the database for review and approval",
  inputSchema: z.object({
    organizationId: z.string().describe("Organization ID"),
    hook: z.string().describe("Hook text"),
    body: z.string().describe("Body text"),
    cta: z.string().describe("CTA text"),
    title: z.string().optional().describe("Script title"),
    recreationType: z.string().describe("Type: mirror, transpose, extract, or mashup"),
    sourceTrackedPostId: z.string().optional().describe("ID of the source viral post that inspired this"),
    targetPlatforms: z.array(z.string()).optional().describe("Target platforms for this script"),
    estimatedDuration: z.number().optional().describe("Estimated video duration in seconds"),
  }),
  execute: async (executionContext) => {
    const ctx = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: {
        organizationId: string;
        hook: string;
        body: string;
        cta: string;
        title?: string;
        recreationType: string;
        sourceTrackedPostId?: string;
        targetPlatforms?: string[];
        estimatedDuration?: number;
      }) => {
        // Encode recreation metadata into the title prefix for traceability
        const titlePrefix = `[${input.recreationType}]`;
        const titleBody = input.title ?? input.hook.slice(0, 60);
        const fullTitle = `${titlePrefix} ${titleBody}`.slice(0, 200);

        const script = await db.script.create({
          data: {
            organizationId: input.organizationId,
            title: fullTitle,
            hookText: input.hook,
            bodyText: input.body,
            ctaText: input.cta,
            status: "DRAFT",
          },
        });

        return {
          scriptId: script.id,
          title: script.title,
          status: script.status,
          recreationType: input.recreationType,
        };
      },
      { agentName: AGENT_NAME, toolName: "saveRecreatedScript" },
    );
    return wrappedFn({
      organizationId: ctx.organizationId,
      hook: ctx.hook,
      body: ctx.body,
      cta: ctx.cta,
      title: ctx.title,
      recreationType: ctx.recreationType,
      sourceTrackedPostId: ctx.sourceTrackedPostId,
      targetPlatforms: ctx.targetPlatforms,
      estimatedDuration: ctx.estimatedDuration,
    });
  },
});

const contentRecreatorAgent = new Agent({
  id: 'content-recreator',
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier1, // Tier 1 — creative work requires highest capability
  tools: { getViralPatterns, getBrandContext, saveRecreatedScript },
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

  const result = await contentRecreatorAgent.generate(prompt, {
    instructions: systemPrompt,
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
