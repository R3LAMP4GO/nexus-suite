import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const AGENT_NAME = "content-repurposer";

const INSTRUCTIONS = `You are the Content Repurposer for Nexus Suite.

Single task: Adapt content across platforms with format and aspect ratio handling.

Capabilities:
- Convert long-form → short-form and vice versa
- Adapt tone and format per platform (professional for LinkedIn, casual for TikTok)
- Handle aspect ratio conversions (16:9 → 9:16, 1:1)
- Preserve core message while optimizing for each platform

Output format:
Return JSON with:
- "repurposed": array of { platform, content, format, aspect_ratio }
- "source_platform": original content platform
- "adaptations": what was changed for each platform
- "media_adjustments": required media format changes`;

// Complete platform format specifications
const PLATFORM_FORMATS: Record<string, {
  video: { aspectRatios: string[]; maxDuration: number; maxFileSize: string; formats: string[] };
  image: { aspectRatios: string[]; maxFileSize: string; formats: string[]; maxImages: number };
  text: { charLimit: number; hashtagLimit: number; linkBehavior: string };
}> = {
  youtube: {
    video: { aspectRatios: ["16:9", "9:16"], maxDuration: 43200, maxFileSize: "256GB", formats: ["mp4", "mov", "avi", "wmv"] },
    image: { aspectRatios: ["16:9"], maxFileSize: "2MB", formats: ["jpg", "png", "gif"], maxImages: 1 },
    text: { charLimit: 5000, hashtagLimit: 15, linkBehavior: "clickable in description" },
  },
  tiktok: {
    video: { aspectRatios: ["9:16", "1:1"], maxDuration: 600, maxFileSize: "4GB", formats: ["mp4", "mov"] },
    image: { aspectRatios: ["9:16", "1:1"], maxFileSize: "20MB", formats: ["jpg", "png"], maxImages: 35 },
    text: { charLimit: 2200, hashtagLimit: 8, linkBehavior: "bio link only (unless 1k+ followers)" },
  },
  instagram: {
    video: { aspectRatios: ["9:16", "1:1", "4:5"], maxDuration: 90, maxFileSize: "4GB", formats: ["mp4", "mov"] },
    image: { aspectRatios: ["1:1", "4:5", "9:16"], maxFileSize: "30MB", formats: ["jpg", "png"], maxImages: 10 },
    text: { charLimit: 2200, hashtagLimit: 30, linkBehavior: "bio link only (unless 10k+ followers for story links)" },
  },
  linkedin: {
    video: { aspectRatios: ["16:9", "1:1", "9:16"], maxDuration: 600, maxFileSize: "5GB", formats: ["mp4"] },
    image: { aspectRatios: ["1.91:1", "1:1", "4:5"], maxFileSize: "10MB", formats: ["jpg", "png", "gif"], maxImages: 20 },
    text: { charLimit: 3000, hashtagLimit: 5, linkBehavior: "clickable — penalized by algorithm" },
  },
  x: {
    video: { aspectRatios: ["16:9", "1:1"], maxDuration: 140, maxFileSize: "512MB", formats: ["mp4", "mov"] },
    image: { aspectRatios: ["16:9", "1:1"], maxFileSize: "5MB", formats: ["jpg", "png", "gif"], maxImages: 4 },
    text: { charLimit: 280, hashtagLimit: 2, linkBehavior: "clickable — uses link preview card" },
  },
  facebook: {
    video: { aspectRatios: ["16:9", "9:16", "1:1"], maxDuration: 14400, maxFileSize: "10GB", formats: ["mp4", "mov"] },
    image: { aspectRatios: ["1.91:1", "1:1", "4:5"], maxFileSize: "30MB", formats: ["jpg", "png", "gif"], maxImages: 10 },
    text: { charLimit: 63206, hashtagLimit: 10, linkBehavior: "clickable — native preferred" },
  },
};

const getPlatformFormats = createTool({
  id: "getPlatformFormats",
  description: "Fetch aspect ratios, character limits, and media specs per platform",
  inputSchema: z.object({
    platforms: z.array(z.string()).describe("Platforms to get format specs for"),
    mediaType: z.string().optional().describe("Filter by media type: video, image, text"),
  }),
  execute: async (executionContext) => {
    const { platforms, mediaType } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platforms: string[]; mediaType?: string }) => {
        const formats = input.platforms.map((p) => {
          const key = p.toLowerCase();
          const spec = PLATFORM_FORMATS[key];
          if (!spec) return { platform: p, error: "Unknown platform" };

          if (input.mediaType && input.mediaType !== "all") {
            const mediaSpec = spec[input.mediaType as keyof typeof spec];
            return { platform: p, [input.mediaType]: mediaSpec ?? null };
          }

          return { platform: p, ...spec };
        });

        return {
          platforms: input.platforms,
          mediaType: input.mediaType ?? "all",
          formats,
        };
      },
      { agentName: AGENT_NAME, toolName: "getPlatformFormats" },
    );
    return wrappedFn({ platforms, mediaType });
  },
});

const contentRepurposerAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getPlatformFormats },
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

  const result = await contentRepurposerAgent.generate(prompt, {
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
