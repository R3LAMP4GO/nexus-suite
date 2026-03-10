// Facebook sub-agent: Reel Hook Adapter — Tier 2.5
// Adapts hooks and intros specifically for Facebook Reels format and algorithm.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";

const adaptReelHook = createTool({
  id: "adaptReelHook",
  description: "Adapt a hook or intro for Facebook Reels format — optimized for FB algorithm",
  inputSchema: z.object({
    originalHook: z.string().describe("Original hook text or concept"),
    niche: z.string().optional().describe("Content niche (e.g. fitness, finance, tech)"),
    targetDuration: z.number().optional().describe("Target reel duration in seconds (max 90)"),
  }),
  execute: async (executionContext) => {
    const { originalHook, niche, targetDuration } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { originalHook: string; niche?: string; targetDuration?: number }) => ({
        originalHook: input.originalHook,
        niche: input.niche ?? "general",
        targetDuration: Math.min(input.targetDuration ?? 30, 90),
        adaptedHook: "",
        textOverlay: "",
        status: "pending-integration" as const,
      }),
      { agentName: "reel-hook-adapter", toolName: "adaptReelHook" },
    );
    return wrappedFn({ originalHook, niche, targetDuration });
  },
});

export const reelHookAdapterAgent = new Agent({
  name: "reel-hook-adapter",
  instructions: `You are a Reel Hook Adapter sub-agent for the Facebook platform.

Your job is to adapt hooks and intros specifically for Facebook Reels:
- Maximum 90 seconds duration
- Hook must land in first 1-2 seconds (Facebook's algorithm weights early retention heavily)
- Facebook Reels favor educational and relatable content over polished production
- Use text overlays — many viewers watch without sound
- Pattern interrupts: unexpected visuals, zoom-ins, quick cuts
- Facebook audience skews older than TikTok — adjust language and references

Facebook Reels algorithm signals:
- Watch time and replay rate are primary ranking factors
- Shares to Messenger/Stories boost distribution
- Comments drive ranking more than likes
- Original audio performs better than trending sounds

Return structured output with adapted hook, text overlay suggestion, and timing notes.`,
  model: modelConfig.tier25,
  tools: { adaptReelHook },
});
