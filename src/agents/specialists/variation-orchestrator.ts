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

// FFmpeg transform presets with quality-impact ratings
const TRANSFORM_PRESETS = [
  {
    id: "subtle-crop",
    name: "Subtle Crop",
    description: "Crop 1-3% from edges — invisible to viewer, changes hash",
    qualityLoss: 1,
    filter: "crop=iw*0.98:ih*0.98:iw*0.01:ih*0.01",
    category: "spatial",
  },
  {
    id: "color-shift",
    name: "Color Shift",
    description: "Shift hue by 1-3 degrees — imperceptible, changes hash",
    qualityLoss: 0,
    filter: "hue=h=2",
    category: "color",
  },
  {
    id: "brightness-adjust",
    name: "Brightness Adjust",
    description: "Adjust brightness by ±2% — below perception threshold",
    qualityLoss: 0,
    filter: "eq=brightness=0.02",
    category: "color",
  },
  {
    id: "speed-micro",
    name: "Micro Speed Change",
    description: "Speed up/down by 0.5-1% — undetectable, changes temporal hash",
    qualityLoss: 1,
    filter: "setpts=0.995*PTS",
    audioFilter: "atempo=1.005",
    category: "temporal",
  },
  {
    id: "audio-pitch",
    name: "Audio Pitch Shift",
    description: "Shift audio pitch by 0.5-1 semitone — subtle, changes audio fingerprint",
    qualityLoss: 2,
    filter: "",
    audioFilter: "asetrate=44100*1.01,aresample=44100",
    category: "audio",
  },
  {
    id: "noise-inject",
    name: "Noise Injection",
    description: "Add imperceptible noise layer — changes every frame hash",
    qualityLoss: 1,
    filter: "noise=alls=2:allf=t",
    category: "noise",
  },
  {
    id: "metadata-strip",
    name: "Metadata Strip & Re-encode",
    description: "Strip all metadata and re-encode — different binary output",
    qualityLoss: 2,
    filter: "",
    outputArgs: ["-map_metadata", "-1", "-c:v", "libx264", "-crf", "18"],
    category: "encode",
  },
  {
    id: "mirror-flip",
    name: "Horizontal Mirror",
    description: "Horizontally flip the video — completely different hash, visible change",
    qualityLoss: 0,
    filter: "hflip",
    category: "spatial",
  },
  {
    id: "overlay-watermark",
    name: "Invisible Watermark",
    description: "Add transparent 1-pixel overlay in corner — changes hash without visible change",
    qualityLoss: 0,
    filter: "drawbox=x=0:y=0:w=1:h=1:color=black@0.01:t=fill",
    category: "overlay",
  },
];

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
      async (input: { videoFormat?: string; maxQualityLoss?: number }) => {
        const maxLoss = input.maxQualityLoss ?? 5;
        const format = input.videoFormat ?? "mp4";

        // Filter presets by quality loss threshold
        const eligible = TRANSFORM_PRESETS.filter((p) => p.qualityLoss <= maxLoss);

        // Build a sample FFmpeg command combining multiple subtle transforms
        const subtlePresets = eligible.filter((p) => p.qualityLoss <= 2 && p.filter);
        const filterChain = subtlePresets.map((p) => p.filter).filter(Boolean).join(",");
        const audioFilters = eligible
          .map((p) => (p as Record<string, unknown>).audioFilter as string | undefined)
          .filter(Boolean)
          .join(",");

        const sampleCommand = [
          "ffmpeg -i input." + format,
          filterChain ? `-vf "${filterChain}"` : "",
          audioFilters ? `-af "${audioFilters}"` : "",
          "-c:v libx264 -crf 18 -preset medium",
          "-c:a aac -b:a 128k",
          "output_variation_N." + format,
        ].filter(Boolean).join(" ");

        return {
          videoFormat: format,
          maxQualityLoss: maxLoss,
          presets: eligible,
          sampleFfmpegCommand: sampleCommand,
          hashStrategy: "Combine 3-4 subtle transforms (crop + color + speed + noise) per variation for unique hashes with <2% quality loss",
        };
      },
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
