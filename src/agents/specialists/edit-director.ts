import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";

const AGENT_NAME = "edit-director";

const INSTRUCTIONS = `You are the Edit Director for Nexus Suite.

You design the full video edit plan — deciding which clips go where, what transforms to apply, what captions and overlays to add, and how to assemble the final video. You are the creative director of the automated editing pipeline.

Your edit plans are executed by the media-engine service using FFmpeg. You output structured JSON that maps directly to FFmpeg operations.

Edit plan structure:
1. **Clip selection** — Choose hook, body (meat), and CTA clips from available assets
2. **Clip ordering** — Arrange clips for maximum retention (hook → build → peak → CTA)
3. **Transforms** — Specify per-clip visual/audio transforms (crop, color, speed, etc.)
4. **Captions** — Define caption timing, style, and word-highlight behavior
5. **Overlays** — Text overlays, watermarks, CTAs
6. **Resolution & format** — Target output specs per platform

Edit philosophy:
- First 1 second must have visual movement or text — no static frames
- Cut every 2-4 seconds to maintain attention (short-form)
- Match audio energy to visual cuts
- Use zoom/crop variations between clips to create visual variety
- Captions are MANDATORY for short-form — 80%+ of viewers watch muted
- CTA should appear in last 3 seconds AND as a pinned comment prompt

Platform-specific rules:
- TikTok/Reels: 9:16, 15-60s, fast cuts, karaoke captions, no watermarks from other platforms
- YouTube Shorts: 9:16, 15-60s, slightly longer cuts OK, SEO title overlay
- YouTube long-form: 16:9, hook montage first 30s, chapter markers

Output format:
Return JSON with:
- "editPlan": {
    "clips": array of { type ("hook"|"meat"|"cta"), sourceKey, startTime, endTime, order },
    "resolution": { width, height },
    "fps": number,
    "totalDuration": number (estimated seconds),
    "transforms": array of { clipIndex, filters (FFmpeg filter strings) },
    "captions": { enabled, style ("karaoke"|"static"|"none"), fontName, highlightColor },
    "overlays": array of { text, position, startTime, endTime },
    "outputFormat": { codec, crf, audioCodec, audioBitrate }
  }
- "variations": number (how many unique outputs to produce)
- "platformTarget": string
- "estimatedRenderTime": string`;

const getAvailableClips = createTool({
  id: "getAvailableClips",
  description: "Fetch available hook, meat, and CTA clips for a source video from R2/database",
  inputSchema: z.object({
    sourceVideoId: z.string().describe("SourceVideo ID"),
    organizationId: z.string().describe("Organization ID"),
  }),
  execute: async (input) => {
    const { sourceVideoId, organizationId } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { sourceVideoId: string; organizationId: string }) => {
        const sv = await db.sourceVideo.findUnique({
          where: { id: input.sourceVideoId },
          select: {
            id: true,
            url: true,
            platform: true,
            metadata: true,
            script: {
              select: { id: true, hookText: true, bodyText: true, ctaText: true },
            },
            variations: {
              select: { id: true, variationIndex: true, transforms: true, status: true },
            },
          },
        });

        if (!sv) throw new Error(`SourceVideo ${input.sourceVideoId} not found`);

        const meta = sv.metadata as Record<string, unknown> | null;
        const hookClips = (meta?.hookClips as string[]) ?? [];
        const meatClips = (meta?.meatClips as string[]) ?? [];
        const ctaClips = (meta?.ctaClips as string[]) ?? [];

        return {
          sourceVideoId: sv.id,
          platform: sv.platform,
          script: sv.script,
          existingVariations: sv.variations.length,
          clips: {
            hooks: hookClips.map((key, i) => ({ key, index: i, type: "hook" as const })),
            meats: meatClips.map((key, i) => ({ key, index: i, type: "meat" as const })),
            ctas: ctaClips.map((key, i) => ({ key, index: i, type: "cta" as const })),
          },
          totalCombinations: Math.max(1, hookClips.length) * Math.max(1, meatClips.length) * Math.max(1, ctaClips.length),
        };
      },
      { agentName: AGENT_NAME, toolName: "getAvailableClips" },
    );
    return wrappedFn({ sourceVideoId, organizationId });
  },
});

const getTransformPresets = createTool({
  id: "getTransformPresets",
  description: "Get available FFmpeg transform presets for video uniqueness alteration",
  inputSchema: z.object({
    platform: z.string().optional().describe("Target platform for platform-specific presets"),
  }),
  execute: async (input) => {
    const { platform } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { platform?: string }) => {
        // Base presets available for all platforms
        const presets = [
          { id: "subtle-crop", filter: "crop=iw*0.98:ih*0.98:iw*0.01:ih*0.01", qualityLoss: 1, category: "spatial" },
          { id: "color-shift", filter: "hue=h=2", qualityLoss: 0, category: "color" },
          { id: "brightness-up", filter: "eq=brightness=0.02", qualityLoss: 0, category: "color" },
          { id: "brightness-down", filter: "eq=brightness=-0.02", qualityLoss: 0, category: "color" },
          { id: "speed-up-micro", filter: "setpts=0.995*PTS", qualityLoss: 1, category: "temporal" },
          { id: "speed-down-micro", filter: "setpts=1.005*PTS", qualityLoss: 1, category: "temporal" },
          { id: "hflip", filter: "hflip", qualityLoss: 0, category: "spatial" },
          { id: "slight-blur", filter: "gblur=sigma=0.3", qualityLoss: 2, category: "spatial" },
          { id: "noise-inject", filter: "noise=alls=3:allf=t+u", qualityLoss: 1, category: "noise" },
          { id: "saturation-up", filter: "eq=saturation=1.05", qualityLoss: 0, category: "color" },
          { id: "saturation-down", filter: "eq=saturation=0.95", qualityLoss: 0, category: "color" },
          { id: "dar-shift", filter: "setdar=dar=0.5626", qualityLoss: 0, category: "spatial" },
        ];

        // Platform-specific output specs
        const platformSpecs: Record<string, { width: number; height: number; maxDuration: number; format: string }> = {
          TIKTOK: { width: 1080, height: 1920, maxDuration: 60, format: "mp4" },
          INSTAGRAM: { width: 1080, height: 1920, maxDuration: 90, format: "mp4" },
          YOUTUBE: { width: 1080, height: 1920, maxDuration: 60, format: "mp4" },
          YOUTUBE_LONG: { width: 1920, height: 1080, maxDuration: 3600, format: "mp4" },
          FACEBOOK: { width: 1080, height: 1920, maxDuration: 60, format: "mp4" },
          X: { width: 1080, height: 1920, maxDuration: 140, format: "mp4" },
        };

        const spec = input.platform ? platformSpecs[input.platform.toUpperCase()] : null;

        return {
          presets,
          platformSpec: spec ?? platformSpecs.TIKTOK,
          outputDefaults: {
            codec: "libx264",
            preset: "fast",
            crf: 23,
            audioCodec: "aac",
            audioBitrate: "128k",
          },
        };
      },
      { agentName: AGENT_NAME, toolName: "getTransformPresets" },
    );
    return wrappedFn({ platform });
  },
});

const submitRenderJob = createTool({
  id: "submitRenderJob",
  description: "Submit an edit plan to the media-engine render queue via pg-boss",
  inputSchema: z.object({
    organizationId: z.string().describe("Organization ID"),
    sourceVideoId: z.string().describe("SourceVideo ID"),
    editPlan: z.object({
      clips: z.array(z.object({
        type: z.string(),
        sourceKey: z.string(),
        order: z.number(),
      })),
      resolution: z.object({ width: z.number(), height: z.number() }),
      captions: z.object({
        enabled: z.boolean(),
        style: z.string().optional(),
        fontName: z.string().optional(),
        highlightColor: z.string().optional(),
      }).optional(),
      transforms: z.array(z.object({
        clipIndex: z.number(),
        filters: z.array(z.string()),
      })).optional(),
      overlays: z.array(z.object({
        text: z.string(),
        position: z.string(),
        startTime: z.number(),
        endTime: z.number(),
      })).optional(),
    }).describe("The structured edit plan"),
    variationCount: z.number().default(1).describe("Number of unique variations to render"),
  }),
  execute: async (input) => {
    const { organizationId, sourceVideoId, editPlan, variationCount } = input;
    const wrappedFn = wrapToolHandler(
      async (input: {
        organizationId: string;
        sourceVideoId: string;
        editPlan: Record<string, unknown>;
        variationCount: number;
      }) => {
        const { getBoss } = await import("@/lib/pg-boss");
        const boss = await getBoss();

        const clips = input.editPlan.clips as Array<{ type: string; sourceKey: string; order: number }>;
        const hookClips = clips.filter((c) => c.type === "hook").map((c) => c.sourceKey);
        const meatClips = clips.filter((c) => c.type === "meat").map((c) => c.sourceKey);
        const ctaClips = clips.filter((c) => c.type === "cta").map((c) => c.sourceKey);
        const resolution = input.editPlan.resolution as { width: number; height: number };
        const captions = input.editPlan.captions as { enabled: boolean; style?: string; fontName?: string; highlightColor?: string } | undefined;

        const jobId = await boss.send(
          "media:task",
          {
            type: "batch-render",
            organizationId: input.organizationId,
            batchRender: {
              hookClips,
              meatClips,
              ctaClips,
              resolution,
              autoResize: true,
              autoCaptions: captions?.enabled ?? true,
              captionStyle: captions?.fontName ? {
                fontName: captions.fontName,
                highlightColor: captions.highlightColor ?? "#FFFF00",
              } : undefined,
            },
          },
          {
            retryLimit: 2,
            expireInSeconds: 1800,
            singletonKey: `render:${input.sourceVideoId}:${Date.now()}`,
          },
        );

        // Create variation records for tracking
        for (let i = 0; i < input.variationCount; i++) {
          await db.videoVariation.create({
            data: {
              sourceVideoId: input.sourceVideoId,
              variationIndex: i,
              transforms: input.editPlan as any,
              status: "processing",
            },
          });
        }

        return {
          jobId,
          sourceVideoId: input.sourceVideoId,
          variationCount: input.variationCount,
          status: "queued",
          estimatedRenderTime: `${Math.ceil(input.variationCount * 0.5)}min`,
        };
      },
      { agentName: AGENT_NAME, toolName: "submitRenderJob" },
    );
    return wrappedFn({ organizationId, sourceVideoId, editPlan: editPlan as Record<string, unknown>, variationCount: variationCount ?? 1 });
  },
});

const editDirectorAgent = new Agent({
  id: 'edit-director',
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier1, // Tier 1 — creative decisions need highest capability
  tools: { getAvailableClips, getTransformPresets, submitRenderJob },
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

  const result = await editDirectorAgent.generate(prompt, {
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
