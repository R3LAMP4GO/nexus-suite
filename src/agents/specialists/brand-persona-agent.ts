import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";
import { loadBrandPrompt } from "../general/brand-loader";

const AGENT_NAME = "brand-persona-agent";

const INSTRUCTIONS = `You are the Brand Persona Agent for Nexus Suite.

Single task: Generate and refine brand system prompts from onboarding data.

Capabilities:
- Analyze brand website, social presence, and existing content via web scraper
- Extract brand voice attributes: tone, vocabulary, values, personality
- Generate a reusable Brand System Prompt for all content agents
- Update brand persona based on new data or user feedback

Output format:
Return JSON with:
- "brand_prompt": the generated system prompt for brand voice
- "voice_attributes": { tone, formality, vocabulary_level, personality_traits }
- "do": array of brand voice dos
- "dont": array of brand voice don'ts
- "example_phrases": array of on-brand example phrases`;

const getBrandProfile = createTool({
  id: "getBrandProfile",
  description: "Fetch organization brand voice, tone, values, and visual identity",
  inputSchema: z.object({
    organizationId: z.string().describe("Organization ID to fetch brand profile for"),
    includeVisual: z.boolean().optional().describe("Include visual identity guidelines"),
  }),
  execute: async (executionContext) => {
    const { organizationId, includeVisual } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { organizationId: string; includeVisual?: boolean }) => {
        // Load org from DB with brand config and onboarding data
        const org = await db.organization.findUnique({
          where: { id: input.organizationId },
          select: {
            name: true,
            brandConfig: true,
            onboardingSubmission: true,
          },
        });

        if (!org) {
          return {
            organizationId: input.organizationId,
            error: "Organization not found",
            tone: "",
            formality: "",
            values: [] as string[],
            brandPrompt: null,
          };
        }

        // Parse brandConfig JSON
        const brandCfg = org.brandConfig && typeof org.brandConfig === "object" && !Array.isArray(org.brandConfig)
          ? (org.brandConfig as Record<string, unknown>)
          : {};

        // Load file-based brand prompt if available
        const fileBrandPrompt = loadBrandPrompt(input.organizationId);

        // Extract onboarding data
        const onboarding = org.onboardingSubmission;
        const competitorUrls = onboarding?.competitorUrls
          ? (Array.isArray(onboarding.competitorUrls) ? onboarding.competitorUrls : [])
          : [];
        const platforms = onboarding?.platforms
          ? (Array.isArray(onboarding.platforms) ? onboarding.platforms : [])
          : [];

        return {
          organizationId: input.organizationId,
          orgName: org.name,
          tone: (brandCfg.tone as string) ?? onboarding?.tonePreferences ?? "",
          formality: (brandCfg.formality as string) ?? "",
          values: (brandCfg.values as string[]) ?? [],
          niche: onboarding?.niche ?? "",
          brandVoice: onboarding?.brandVoice ?? "",
          tonePreferences: onboarding?.tonePreferences ?? "",
          contentStyle: onboarding?.contentStyle ?? "",
          postingFrequency: onboarding?.postingFrequency ?? "",
          competitorUrls,
          targetPlatforms: platforms,
          brandPrompt: fileBrandPrompt,
          brandConfig: brandCfg,
          visualIdentity: input.includeVisual ? (brandCfg.visual ?? null) : undefined,
        };
      },
      { agentName: AGENT_NAME, toolName: "getBrandProfile" },
    );
    return wrappedFn({ organizationId, includeVisual });
  },
});

const brandPersonaAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getBrandProfile },
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

  const result = await brandPersonaAgent.generate(prompt, {
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
