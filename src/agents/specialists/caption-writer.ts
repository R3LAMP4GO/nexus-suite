import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import { loadBrandPrompt } from "../general/brand-loader";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Caption Writer for Nexus Suite.

Single task: Write platform-specific captions optimized for engagement.

Capabilities:
- Enforce platform char limits: IG 2200, TikTok 2200, X 280, LinkedIn 3000, FB 63206, YT 5000
- Apply emoji and hashtag rules per platform
- Include CTAs tailored to platform behavior
- Maintain brand voice consistency

Output format:
Return JSON with:
- "caption": the caption text
- "char_count": character count
- "platform": target platform
- "cta": call-to-action included
- "emoji_count": number of emojis used
- "hashtags_included": boolean`;

const AGENT_NAME = "caption-writer";

const getCharLimits = createTool({
  id: "getCharLimits",
  description: "Get character limits and formatting rules per platform",
  inputSchema: z.object({
    platform: z.string().describe("Target platform: instagram, tiktok, twitter, linkedin, facebook, youtube"),
  }),
  execute: async (executionContext) => {
    const { platform } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string }) => {
        const limits: Record<string, { charLimit: number; hashtagLimit: number; emojiAdvice: string }> = {
          instagram: { charLimit: 2200, hashtagLimit: 30, emojiAdvice: "Moderate use (3-5), platform loves them" },
          tiktok: { charLimit: 2200, hashtagLimit: 5, emojiAdvice: "Minimal (1-2), keep it clean" },
          twitter: { charLimit: 280, hashtagLimit: 2, emojiAdvice: "Sparingly (0-2)" },
          x: { charLimit: 280, hashtagLimit: 2, emojiAdvice: "Sparingly (0-2)" },
          linkedin: { charLimit: 3000, hashtagLimit: 5, emojiAdvice: "Professional only (0-2)" },
          facebook: { charLimit: 63206, hashtagLimit: 10, emojiAdvice: "Moderate (2-4)" },
          youtube: { charLimit: 5000, hashtagLimit: 15, emojiAdvice: "Moderate (2-5)" },
        };
        const config = limits[input.platform.toLowerCase()] ?? { charLimit: 2200, hashtagLimit: 10, emojiAdvice: "Moderate" };
        return {
          platform: input.platform,
          ...config,
        };
      },
      { agentName: AGENT_NAME, toolName: "getCharLimits" },
    );
    return wrappedFn({ platform });
  },
});

const getBrandVoice = createTool({
  id: "getBrandVoice",
  description: "Fetch brand voice guidelines and tone for caption writing",
  inputSchema: z.object({
    organizationId: z.string().optional().describe("Organization ID for brand-specific voice"),
  }),
  execute: async (executionContext) => {
    const { organizationId } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { organizationId?: string }) => {
        const orgId = input.organizationId ?? "default";
        const brandPrompt = orgId !== "default" ? loadBrandPrompt(orgId) : null;
        return {
          organizationId: orgId,
          brandPrompt: brandPrompt ?? "Use a professional, engaging tone.",
          loaded: !!brandPrompt,
        };
      },
      { agentName: AGENT_NAME, toolName: "getBrandVoice" },
    );
    return wrappedFn({ organizationId });
  },
});

const captionWriterAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getCharLimits, getBrandVoice },
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

  const result = await captionWriterAgent.generate(prompt, {
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
