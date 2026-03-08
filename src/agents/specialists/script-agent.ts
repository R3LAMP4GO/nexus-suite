// Script Agent — Tier 3 shared specialist
// Writes full video scripts with pacing, structure, and brand voice.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const AGENT_NAME = "script-agent";

const INSTRUCTIONS = `You are the Script Agent for Nexus Suite.

Single task: Write full video scripts with pacing, structure, and brand voice.

Capabilities:
- Generate scripts for short-form (15s-3min) and long-form (3-60min) video
- Structure: hook → problem → solution → CTA
- Include visual directions, B-roll suggestions, and timing cues
- Apply brand voice and tone consistently
- Pass quality gate before delivery

Output format:
Return JSON with:
- "script": full script with timestamps and visual cues
- "duration_estimate": estimated video length in seconds
- "sections": array of { timestamp, content, visual_direction }
- "word_count": total word count
- "reading_speed": words per minute target`;

const getScriptTemplate = createTool({
  id: "getScriptTemplate",
  description: "Fetch platform-specific script structures and pacing guidelines",
  inputSchema: z.object({
    platform: z.string().describe("Target platform (youtube, tiktok, instagram)"),
    format: z.enum(["short", "long"]).optional().describe("Short-form or long-form"),
    duration: z.number().optional().describe("Target duration in seconds"),
  }),
  execute: async (executionContext) => {
    const { platform, format, duration } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; format?: string; duration?: number }) => ({
        platform: input.platform,
        format: input.format ?? "short",
        targetDuration: input.duration ?? 60,
        structure: [] as string[],
        pacingGuidelines: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getScriptTemplate" },
    );
    return wrappedFn({ platform, format, duration });
  },
});

const scriptAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getScriptTemplate },
});

export function createAgent() {
  return scriptAgent;
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

  const result = await scriptAgent.generate(prompt, {
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
