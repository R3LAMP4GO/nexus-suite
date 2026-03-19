// Thumbnail Creator — Tier 3 shared specialist
// Designs thumbnail prompts and text overlay specifications.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const AGENT_NAME = "thumbnail-creator";

const INSTRUCTIONS = `You are the Thumbnail Creator for Nexus Suite.

Single task: Design thumbnail prompts and text overlay specifications.

Capabilities:
- Generate image generation prompts for FAL.ai (Nano Banana Pro model)
- Specify text overlay: position, font, color, size
- Follow thumbnail best practices: faces, contrast, 3-word max text
- Enforce dimensions: YouTube 1280x720, Instagram 1080x1080/1080x1350

Output format:
Return JSON with:
- "image_prompt": prompt for FAL.ai image generation
- "text_overlay": { text, position, font, color, size }
- "dimensions": { width, height }
- "style_notes": visual style recommendations
- "contrast_score": estimated visual contrast rating`;

const getThumbnailSpecs = createTool({
  id: "getThumbnailSpecs",
  description: "Fetch platform dimensions, text overlay rules, and contrast requirements for thumbnails",
  inputSchema: z.object({
    platform: z.string().describe("Target platform (youtube, instagram, tiktok)"),
    style: z.string().optional().describe("Visual style preference (bold, minimal, cinematic)"),
  }),
  execute: async (input) => {
    const { platform, style } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; style?: string }) => {
        const PLATFORM_SPECS: Record<string, {
          dimensions: { width: number; height: number };
          aspectRatio: string;
          maxFileSize: string;
          format: string[];
          safeZone: { top: number; bottom: number; left: number; right: number };
          uiOverlays: string[];
        }> = {
          youtube: {
            dimensions: { width: 1280, height: 720 },
            aspectRatio: "16:9",
            maxFileSize: "2MB",
            format: ["JPG", "PNG"],
            safeZone: { top: 0, bottom: 60, left: 0, right: 120 },
            uiOverlays: ["Duration badge bottom-right", "Watch Later icon top-right on hover"],
          },
          instagram: {
            dimensions: { width: 1080, height: 1080 },
            aspectRatio: "1:1",
            maxFileSize: "30MB",
            format: ["JPG", "PNG"],
            safeZone: { top: 0, bottom: 100, left: 0, right: 0 },
            uiOverlays: ["Reel/carousel icon top-right", "Like/comment bar bottom"],
          },
          tiktok: {
            dimensions: { width: 1080, height: 1920 },
            aspectRatio: "9:16",
            maxFileSize: "10MB",
            format: ["JPG", "PNG"],
            safeZone: { top: 150, bottom: 270, left: 0, right: 80 },
            uiOverlays: ["Right sidebar (like/comment/share/save)", "Bottom bar (caption + sound)", "Top bar (Following/For You)"],
          },
        };

        const STYLE_GUIDELINES: Record<string, {
          textRules: { maxWords: number; minFontSize: number; contrastRatio: number; fontWeight: string };
          colorGuidelines: string[];
          compositionRules: string[];
          promptHints: string[];
        }> = {
          bold: {
            textRules: { maxWords: 4, minFontSize: 48, contrastRatio: 7, fontWeight: "900 (Black)" },
            colorGuidelines: ["Use complementary colors (red/cyan, yellow/purple)", "Background should be saturated, not pastel", "Text outline or drop shadow mandatory"],
            compositionRules: ["Face takes up 40-60% of frame", "Eyes in upper third", "Text in remaining space, never over face", "One focal point only"],
            promptHints: ["dramatic lighting", "high contrast", "vivid colors", "close-up portrait", "expressive face"],
          },
          minimal: {
            textRules: { maxWords: 3, minFontSize: 36, contrastRatio: 4.5, fontWeight: "600 (Semi-Bold)" },
            colorGuidelines: ["Max 2 colors + white", "Muted tones or monochrome", "Generous whitespace"],
            compositionRules: ["Clean background", "Centered subject", "Text as accent, not focus", "Rule of thirds"],
            promptHints: ["clean background", "soft lighting", "minimalist", "centered composition", "neutral tones"],
          },
          cinematic: {
            textRules: { maxWords: 5, minFontSize: 40, contrastRatio: 5, fontWeight: "700 (Bold)" },
            colorGuidelines: ["Teal/orange color grading", "Dark moody tones", "Accent color for text pop"],
            compositionRules: ["Widescreen crop feel even in square", "Shallow depth of field", "Dramatic angles", "Leading lines toward subject"],
            promptHints: ["cinematic lighting", "film grain", "shallow depth of field", "dramatic shadows", "teal and orange"],
          },
        };

        const platformKey = input.platform.toLowerCase();
        const styleKey = (input.style ?? "bold").toLowerCase();
        const specs = PLATFORM_SPECS[platformKey] ?? PLATFORM_SPECS.youtube;
        const styleGuide = STYLE_GUIDELINES[styleKey] ?? STYLE_GUIDELINES.bold;

        return {
          platform: input.platform,
          style: styleKey,
          dimensions: specs.dimensions,
          aspectRatio: specs.aspectRatio,
          maxFileSize: specs.maxFileSize,
          format: specs.format,
          safeZone: specs.safeZone,
          uiOverlays: specs.uiOverlays,
          textRules: styleGuide.textRules,
          colorGuidelines: styleGuide.colorGuidelines,
          compositionRules: styleGuide.compositionRules,
          promptHints: styleGuide.promptHints,
          bestPractices: [
            "Faces increase CTR by 38% — always include a human face if possible",
            "3 words max for text overlay — thumbnails are seen at 120px wide",
            "Test with a grayscale version — if it reads in B&W, it works in color",
            `Avoid text in safe zones: ${specs.uiOverlays.join(", ")}`,
          ],
        };
      },
      { agentName: AGENT_NAME, toolName: "getThumbnailSpecs" },
    );
    return wrappedFn({ platform, style });
  },
});

const thumbnailCreatorAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getThumbnailSpecs },
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

  const result = await thumbnailCreatorAgent.generate(prompt, {
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
