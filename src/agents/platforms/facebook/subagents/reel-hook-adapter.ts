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
      async (input: { originalHook: string; niche?: string; targetDuration?: number }) => {
        const hook = input.originalHook;
        const niche = input.niche ?? "general";

        // Generate Reels-optimized variations
        const variations = [
          {
            text: hook,
            format: "text-overlay",
            timing: "0-3s",
            tip: "Original hook as bold text overlay with motion",
          },
          {
            text: `Wait for it... ${hook}`,
            format: "delayed-reveal",
            timing: "0-2s tease, 2-4s reveal",
            tip: "Build anticipation before the hook lands",
          },
          {
            text: hook.length > 50 ? hook.slice(0, 50) + "..." : hook,
            format: "short-punch",
            timing: "0-2s",
            tip: "Shortened for faster impact — pair with visual shock",
          },
        ];

        return {
          originalHook: hook,
          niche,
          reelsVariations: variations,
          formatSpecs: {
            aspectRatio: "9:16",
            resolution: "1080x1920",
            maxDuration: 90,
            textSafeZone: { top: 150, bottom: 270, left: 40, right: 40 },
            fontSizeRange: "32-64px",
          },
          bestPractices: [
            "First frame must be visually arresting — no blank screens",
            "Text overlay appears within 0.5s of video start",
            "Use captions — 85% of Reels watched on mute",
            "Hook text should be max 2 lines on mobile",
            "Pair text hook with contrasting visual (before/after, zoom, reveal)",
          ],
          audioRecommendation: "Use trending Reels audio for algorithmic boost — add to Saved Audio library",
        };
      },
      { agentName: "reel-hook-adapter", toolName: "adaptReelHook" },
    );
    return wrappedFn({ originalHook, niche, targetDuration });
  },
});

export const reelHookAdapterAgent = new Agent({
  id: "reel-hook-adapter",
  name: "Reel Hook Adapter",
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
