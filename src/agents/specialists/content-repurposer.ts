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
      async (input: { platforms: string[]; mediaType?: string }) => ({
        platforms: input.platforms,
        mediaType: input.mediaType ?? "all",
        formats: [] as Record<string, unknown>[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getPlatformFormats" },
    );
    return wrappedFn({ platforms, mediaType });
  },
});

const contentRepurposerAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getPlatformFormats },
});

export function createAgent() {
  return contentRepurposerAgent;
}

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

  const result = await contentRepurposerAgent.generate(prompt, {
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
