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
      async (input: { platform: string; format?: string; duration?: number }) => {
        const fmt = input.format ?? "short";
        const dur = input.duration ?? (fmt === "short" ? 30 : 600);

        const STRUCTURES: Record<string, Record<string, string[]>> = {
          short: {
            tiktok: [
              "0-3s: HOOK — pattern interrupt, bold claim, or visual shock",
              "3-8s: SETUP — establish context in one sentence",
              "8-20s: BODY — deliver the core value/entertainment",
              "20-28s: PAYOFF — punchline, reveal, or transformation",
              "28-30s: CTA — follow, like, or comment prompt",
            ],
            youtube: [
              "0-3s: HOOK — 'Did you know...' or visual surprise",
              "3-10s: CONTEXT — who/what/why this matters",
              "10-40s: CONTENT — main value delivery with B-roll",
              "40-55s: CLIMAX — the reveal, result, or peak moment",
              "55-60s: CTA — subscribe + next video tease",
            ],
            instagram: [
              "0-2s: HOOK — text overlay + eye contact or motion",
              "2-5s: SETUP — 'Here's why...' or 'Watch this...'",
              "5-20s: BODY — quick-cut delivery, high energy",
              "20-27s: PAYOFF — transformation or result",
              "27-30s: CTA — 'Save this' or 'Share with someone who...'",
            ],
          },
          long: {
            youtube: [
              "0-30s: COLD OPEN — teaser of the best moment",
              "30s-1m: INTRO — channel branding + what viewer will learn",
              "1-2m: CONTEXT — background and why this matters now",
              "2-7m: BODY SECTION 1 — first main point with examples",
              "7-8m: TRANSITION — recap + preview next section",
              "8-13m: BODY SECTION 2 — second main point, deeper dive",
              "13-14m: PIVOT — address counterarguments or common questions",
              "14-18m: BODY SECTION 3 — advanced tips or case studies",
              "18-19m: SUMMARY — key takeaways in bullet form",
              "19-20m: CTA — like/subscribe/comment question + end screen",
            ],
          },
        };

        const PACING: Record<string, string[]> = {
          short: [
            "Speak at 160-180 WPM (faster than conversational)",
            "Cut every 2-3 seconds — never hold a shot longer than 4s",
            "Use jump cuts to eliminate dead air",
            "Add captions — 85% of short-form is watched on mute",
            "Front-load value — assume viewer leaves at 3 seconds",
          ],
          long: [
            "Speak at 140-160 WPM (natural but energetic)",
            "Change visual every 5-8 seconds (B-roll, graphics, angle change)",
            "Add pattern interrupts every 60-90 seconds to reset attention",
            "Use chapter markers for YouTube retention",
            "Place a re-hook at the 30% mark to catch drop-off",
            "Energy should peak at 70% through, not at the start",
          ],
        };

        const platformKey = input.platform.toLowerCase();
        const structureKey = fmt === "long" ? "long" : "short";
        const platformStructures = STRUCTURES[structureKey] ?? {};
        const structure = platformStructures[platformKey] ?? platformStructures.youtube ?? platformStructures.tiktok ?? [];

        return {
          platform: input.platform,
          format: fmt,
          targetDuration: dur,
          structure,
          pacingGuidelines: PACING[structureKey] ?? PACING.short,
          wordCount: {
            estimated: Math.round(dur * 2.5),
            min: Math.round(dur * 2),
            max: Math.round(dur * 3),
          },
          tips: [
            fmt === "short"
              ? `At ${dur}s, you have ~${Math.round(dur * 2.5)} words — make every one count`
              : `At ${Math.round(dur / 60)}min, aim for ${Math.round(dur * 2.5)} words with visual variety`,
            "Write for the ear, not the page — read it aloud",
            "Every sentence must either inform, entertain, or create tension",
          ],
        };
      },
      { agentName: AGENT_NAME, toolName: "getScriptTemplate" },
    );
    return wrappedFn({ platform, format, duration });
  },
});

const scriptAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getScriptTemplate },
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

  const result = await scriptAgent.generate(prompt, {
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
