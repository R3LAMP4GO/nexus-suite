import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const AGENT_NAME = "variation-orchestrator";

const INSTRUCTIONS = `You are the Variation Orchestrator for Nexus Suite.

Single task: Generate FFmpeg transform JSON for video hash alteration and uniqueness.

Capabilities:
- Create FFmpeg filter chain specifications for subtle video modifications
- Apply transformations: slight crop, color shift, speed adjust, audio pitch
- Ensure each variation produces a unique file hash
- Parse video metadata to determine safe transformation ranges

Output format:
Return JSON with:
- "transforms": array of FFmpeg filter specifications
- "variations_count": number of unique variations to produce
- "hash_strategy": how uniqueness is achieved
- "quality_impact": estimated quality loss per variation (0-100)
- "ffmpeg_command": template FFmpeg command string`;

const getTransformPresets = createTool({
  id: "getTransformPresets",
  description: "Fetch FFmpeg transform presets for video hash alteration",
  inputSchema: z.object({
    videoFormat: z.string().optional().describe("Source video format (mp4, webm, etc.)"),
    maxQualityLoss: z.number().optional().describe("Max acceptable quality loss 0-100"),
  }),
  execute: async (executionContext) => {
    const { videoFormat, maxQualityLoss } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { videoFormat?: string; maxQualityLoss?: number }) => ({
        videoFormat: input.videoFormat ?? "mp4",
        maxQualityLoss: input.maxQualityLoss ?? 5,
        presets: [] as Record<string, unknown>[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getTransformPresets" },
    );
    return wrappedFn({ videoFormat, maxQualityLoss });
  },
});

const variationOrchestratorAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getTransformPresets },
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

  const result = await variationOrchestratorAgent.generate(prompt, {
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
