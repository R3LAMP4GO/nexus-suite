import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
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
        const limits: Record<string, number> = {
          instagram: 2200, tiktok: 2200, twitter: 280, linkedin: 3000, facebook: 63206, youtube: 5000,
        };
        return {
          platform: input.platform,
          charLimit: limits[input.platform] ?? 2200,
          status: "pending-integration" as const,
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
      async (input: { organizationId?: string }) => ({
        organizationId: input.organizationId ?? "default",
        tone: "professional",
        personality: [] as string[],
        avoidWords: [] as string[],
        status: "pending-integration" as const,
      }),
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

export function createAgent() {
  return captionWriterAgent;
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
