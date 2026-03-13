import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { db } from "@/lib/db";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { join } from "node:path";

const AGENT_NAME = "auto-clipper";
const TMP_DIR = "/tmp";

const INSTRUCTIONS = `You are the Auto-Clipper for Nexus Suite.

Your job is to identify and extract the most viral-worthy clips from longer videos. You use transcript data, scene detection, and audio energy analysis to find the moments that would perform best as standalone short-form content.

Clip selection criteria (in priority order):
1. **Hook strength** — Does the first 1-2 seconds grab attention? Strong hooks = pattern interrupts, bold statements, unexpected visuals
2. **Self-contained narrative** — Can the clip stand alone without context? Complete thought or punchline required
3. **Emotional peak** — High energy moments, pivots, reveals, humor beats
4. **Optimal duration** — 15-60 seconds for TikTok/Reels, 30-60 for Shorts
5. **Clean cut points** — Start/end at natural speech boundaries, not mid-sentence

Scene detection strategy:
- Use FFmpeg scene detection (threshold 0.3-0.4) to find visual cut points
- Cross-reference with transcript timestamps to find speech boundaries
- Prefer cuts that start with a new sentence or topic shift
- Avoid cuts during action or mid-gesture

Output format:
Return JSON with:
- "clips": array of {
    id, startTime, endTime, duration,
    hookScore (1-10), viralScore (1-10),
    transcript (text in this clip),
    reason (why this clip was selected),
    suggestedPlatforms (array of platform names)
  }
- "sourceInfo": { totalDuration, totalScenes, analysedSegments }
- "topClip": the single best clip with highest composite score`;

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
}

/**
 * Detect scene changes using FFmpeg's select filter.
 * Returns timestamps where scene score exceeds the threshold.
 */
async function detectScenes(videoPath: string, threshold = 0.35): Promise<number[]> {
  try {
    const result = await new Promise<string>((resolve, reject) => {
      execFile("ffmpeg", [
        "-i", videoPath,
        "-vf", `select='gt(scene,${threshold})',showinfo`,
        "-f", "null", "-",
      ], { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 }, (_err, _stdout, stderr) => {
        resolve(stderr);
      });
    });

    const timestamps: number[] = [0]; // Always include start
    for (const line of result.split("\n")) {
      const match = line.match(/pts_time:([\d.]+)/);
      if (match) {
        timestamps.push(parseFloat(match[1]));
      }
    }

    return [...new Set(timestamps)].sort((a, b) => a - b);
  } catch {
    return [0];
  }
}

/**
 * Detect audio energy levels using FFmpeg astats filter.
 * Returns per-second RMS levels to identify high-energy segments.
 */
async function detectAudioEnergy(videoPath: string): Promise<Array<{ time: number; rms: number }>> {
  try {
    const result = await new Promise<string>((resolve, reject) => {
      execFile("ffmpeg", [
        "-i", videoPath,
        "-af", "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
        "-f", "null", "-",
      ], { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 }, (_err, _stdout, stderr) => {
        resolve(stderr);
      });
    });

    const energy: Array<{ time: number; rms: number }> = [];
    let currentTime = 0;

    for (const line of result.split("\n")) {
      const timeMatch = line.match(/pts_time:([\d.]+)/);
      const rmsMatch = line.match(/RMS_level=([-\d.]+)/);

      if (timeMatch) currentTime = parseFloat(timeMatch[1]);
      if (rmsMatch) {
        const rms = parseFloat(rmsMatch[1]);
        if (isFinite(rms)) {
          energy.push({ time: currentTime, rms });
        }
      }
    }

    return energy;
  } catch {
    return [];
  }
}

/**
 * Extract a clip from the source video using FFmpeg.
 * Uses stream copy where possible for speed, re-encodes if needed.
 */
async function extractClip(
  videoPath: string,
  startTime: number,
  endTime: number,
): Promise<{ outputPath: string; size: number }> {
  const outPath = join(TMP_DIR, `clip-${randomUUID().slice(0, 8)}.mp4`);
  const duration = endTime - startTime;

  await exec("ffmpeg", [
    "-y",
    "-ss", startTime.toFixed(2),
    "-i", videoPath,
    "-t", duration.toFixed(2),
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    outPath,
  ]);

  const fileStat = await stat(outPath);
  return { outputPath: outPath, size: fileStat.size };
}

const detectClipCandidates = createTool({
  id: "detectClipCandidates",
  description: "Analyse a video to find potential clip boundaries using scene detection and audio energy. Returns candidate segments ranked by viral potential.",
  inputSchema: z.object({
    localPath: z.string().describe("Local path to the video file"),
    transcript: z.array(z.object({
      start: z.number(),
      end: z.number(),
      text: z.string(),
    })).optional().describe("Transcript segments from transcript-extractor"),
    minClipDuration: z.number().default(10).describe("Minimum clip duration in seconds"),
    maxClipDuration: z.number().default(60).describe("Maximum clip duration in seconds"),
  }),
  execute: async (executionContext) => {
    const { localPath, transcript, minClipDuration, maxClipDuration } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: {
        localPath: string;
        transcript?: Array<{ start: number; end: number; text: string }>;
        minClipDuration: number;
        maxClipDuration: number;
      }) => {
        // Get duration
        const durationOut = await exec("ffprobe", [
          "-v", "error",
          "-show_entries", "format=duration",
          "-of", "default=noprint_wrappers=1:nokey=1",
          input.localPath,
        ]);
        const totalDuration = parseFloat(durationOut) || 0;

        // Detect scenes and audio energy in parallel
        const [sceneTimestamps, audioEnergy] = await Promise.all([
          detectScenes(input.localPath),
          detectAudioEnergy(input.localPath),
        ]);

        // Build candidate clips from scene boundaries
        const candidates: Array<{
          startTime: number;
          endTime: number;
          duration: number;
          sceneScore: number;
          energyScore: number;
          transcriptText: string;
          sentenceBoundary: boolean;
        }> = [];

        for (let i = 0; i < sceneTimestamps.length; i++) {
          const start = sceneTimestamps[i];

          // Try multiple end points for each start
          for (let j = i + 1; j < sceneTimestamps.length; j++) {
            const end = sceneTimestamps[j];
            const duration = end - start;

            if (duration < input.minClipDuration) continue;
            if (duration > input.maxClipDuration) break;

            // Score based on audio energy in this segment
            const segmentEnergy = audioEnergy.filter((e) => e.time >= start && e.time <= end);
            const avgEnergy = segmentEnergy.length > 0
              ? segmentEnergy.reduce((sum, e) => sum + e.rms, 0) / segmentEnergy.length
              : -40;

            // Normalize energy to 0-1 (typical RMS range is -60 to 0 dB)
            const energyScore = Math.max(0, Math.min(1, (avgEnergy + 60) / 60));

            // Check if start/end align with sentence boundaries
            let transcriptText = "";
            let sentenceBoundary = false;

            if (input.transcript) {
              const overlapping = input.transcript.filter(
                (t) => t.start < end && t.end > start,
              );
              transcriptText = overlapping.map((t) => t.text).join(" ").trim();

              // Check if we start at a sentence boundary
              const firstSeg = overlapping[0];
              if (firstSeg) {
                sentenceBoundary = Math.abs(firstSeg.start - start) < 1.0;
              }
            }

            // Scene density score (more scenes = more visual variety)
            const scenesInClip = sceneTimestamps.filter((t) => t > start && t < end).length;
            const sceneScore = Math.min(1, scenesInClip / 5);

            candidates.push({
              startTime: Math.round(start * 100) / 100,
              endTime: Math.round(end * 100) / 100,
              duration: Math.round(duration * 100) / 100,
              sceneScore,
              energyScore,
              transcriptText,
              sentenceBoundary,
            });
          }
        }

        // If no scene-based candidates, create time-window candidates
        if (candidates.length === 0 && totalDuration > input.minClipDuration) {
          const step = input.minClipDuration;
          for (let start = 0; start + input.minClipDuration <= totalDuration; start += step) {
            const end = Math.min(start + input.maxClipDuration, totalDuration);
            let transcriptText = "";
            if (input.transcript) {
              const overlapping = input.transcript.filter(
                (t) => t.start < end && t.end > start,
              );
              transcriptText = overlapping.map((t) => t.text).join(" ").trim();
            }
            candidates.push({
              startTime: Math.round(start * 100) / 100,
              endTime: Math.round(end * 100) / 100,
              duration: Math.round((end - start) * 100) / 100,
              sceneScore: 0.5,
              energyScore: 0.5,
              transcriptText,
              sentenceBoundary: true,
            });
          }
        }

        // Sort by composite score (energy weighted highest)
        candidates.sort((a, b) => {
          const scoreA = a.energyScore * 0.4 + a.sceneScore * 0.3 + (a.sentenceBoundary ? 0.3 : 0);
          const scoreB = b.energyScore * 0.4 + b.sceneScore * 0.3 + (b.sentenceBoundary ? 0.3 : 0);
          return scoreB - scoreA;
        });

        return {
          totalDuration,
          totalScenes: sceneTimestamps.length,
          candidates: candidates.slice(0, 15), // Top 15 candidates
          audioEnergyProfile: {
            min: audioEnergy.length > 0 ? Math.min(...audioEnergy.map((e) => e.rms)) : -60,
            max: audioEnergy.length > 0 ? Math.max(...audioEnergy.map((e) => e.rms)) : -60,
            avg: audioEnergy.length > 0
              ? audioEnergy.reduce((s, e) => s + e.rms, 0) / audioEnergy.length
              : -60,
          },
        };
      },
      { agentName: AGENT_NAME, toolName: "detectClipCandidates" },
    );
    return wrappedFn({ localPath, transcript, minClipDuration, maxClipDuration });
  },
});

const cutClip = createTool({
  id: "cutClip",
  description: "Extract a specific clip from a video file at the given start/end timestamps. Returns the output file path.",
  inputSchema: z.object({
    localPath: z.string().describe("Source video file path"),
    startTime: z.number().describe("Clip start time in seconds"),
    endTime: z.number().describe("Clip end time in seconds"),
    sourceVideoId: z.string().optional().describe("SourceVideo ID to link the clip to"),
    organizationId: z.string().optional().describe("Organization ID for DB records"),
  }),
  execute: async (executionContext) => {
    const { localPath, startTime, endTime, sourceVideoId, organizationId } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: {
        localPath: string;
        startTime: number;
        endTime: number;
        sourceVideoId?: string;
        organizationId?: string;
      }) => {
        const result = await extractClip(input.localPath, input.startTime, input.endTime);

        return {
          outputPath: result.outputPath,
          size: result.size,
          startTime: input.startTime,
          endTime: input.endTime,
          duration: Math.round((input.endTime - input.startTime) * 100) / 100,
        };
      },
      { agentName: AGENT_NAME, toolName: "cutClip" },
    );
    return wrappedFn({ localPath, startTime, endTime, sourceVideoId, organizationId });
  },
});

const autoClipperAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { detectClipCandidates, cutClip },
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

  const result = await autoClipperAgent.generate(prompt, {
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
