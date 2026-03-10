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
  execute: async (executionContext) => {
    const { platform, style } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; style?: string }) => ({
        platform: input.platform,
        style: input.style ?? "bold",
        dimensions: { width: 1280, height: 720 },
        textRules: { maxWords: 3, minFontSize: 48, contrastRatio: 4.5 },
        overlayGuidelines: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getThumbnailSpecs" },
    );
    return wrappedFn({ platform, style });
  },
});

const thumbnailCreatorAgent = new Agent({
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
  );

  const result = await thumbnailCreatorAgent.generate(prompt, {
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
