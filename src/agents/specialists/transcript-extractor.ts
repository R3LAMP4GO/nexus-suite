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
import { readFile, unlink, stat } from "node:fs/promises";
import { join } from "node:path";

const AGENT_NAME = "transcript-extractor";
const TMP_DIR = "/tmp";

const INSTRUCTIONS = `You are the Transcript Extractor for Nexus Suite.

Your job is to extract, clean, and structure transcripts from video content. You work as part of the viral content pipeline — analysing competitor/viral videos to understand what makes them work.

Capabilities:
1. Extract audio from video files using FFmpeg
2. Transcribe audio to text with timestamps using Whisper
3. Identify key segments: hooks (first 3 seconds), pivots, callbacks, CTAs
4. Tag emotional beats and pacing changes
5. Detect silence gaps and music-only sections

Output format:
Return JSON with:
- "transcript": array of { start, end, text, type ("speech" | "silence" | "music") }
- "hookSegment": { start, end, text } — the opening hook (first 3-5 seconds of speech)
- "ctaSegment": { start, end, text } — the call-to-action (last spoken segment)
- "keyMoments": array of { timestamp, type ("pivot" | "callback" | "emotional_peak" | "punchline"), text }
- "pacing": { wordsPerMinute, averageSentenceLength, longestPause }
- "totalDuration": number (seconds)
- "speechRatio": number (0-1, speech time / total time)`;

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
}

/**
 * Extract audio from a video file to WAV format suitable for Whisper.
 * Outputs 16kHz mono WAV (Whisper's preferred input format).
 */
async function extractAudio(videoPath: string): Promise<string> {
  const outPath = join(TMP_DIR, `audio-${randomUUID().slice(0, 8)}.wav`);
  await exec("ffmpeg", [
    "-y", "-i", videoPath,
    "-vn",                    // no video
    "-acodec", "pcm_s16le",   // 16-bit PCM
    "-ar", "16000",           // 16kHz sample rate
    "-ac", "1",               // mono
    outPath,
  ]);
  return outPath;
}

/**
 * Get video duration in seconds via ffprobe.
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  const out = await exec("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  return parseFloat(out) || 0;
}

/**
 * Detect silence segments in audio using FFmpeg silencedetect filter.
 * Returns array of { start, end } for each silence gap.
 */
async function detectSilence(audioPath: string): Promise<Array<{ start: number; end: number }>> {
  try {
    const result = await new Promise<string>((resolve, reject) => {
      execFile("ffmpeg", [
        "-i", audioPath,
        "-af", "silencedetect=noise=-30dB:d=0.5",
        "-f", "null", "-",
      ], { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 }, (_err, _stdout, stderr) => {
        // silencedetect outputs to stderr even on success
        resolve(stderr);
      });
    });

    const silences: Array<{ start: number; end: number }> = [];
    const lines = result.split("\n");
    let currentStart: number | null = null;

    for (const line of lines) {
      const startMatch = line.match(/silence_start:\s*([\d.]+)/);
      const endMatch = line.match(/silence_end:\s*([\d.]+)/);

      if (startMatch) currentStart = parseFloat(startMatch[1]);
      if (endMatch && currentStart !== null) {
        silences.push({ start: currentStart, end: parseFloat(endMatch[1]) });
        currentStart = null;
      }
    }

    return silences;
  } catch {
    return [];
  }
}

/**
 * Transcribe audio using whisper CLI (whisper.cpp or openai-whisper).
 * Falls back to a simpler ffmpeg-based analysis if whisper is unavailable.
 */
async function transcribeAudio(audioPath: string): Promise<{
  segments: Array<{ start: number; end: number; text: string }>;
  language: string;
}> {
  const jsonPath = audioPath.replace(/\.wav$/, ".json");

  // Try whisper CLI first (whisper.cpp or openai-whisper)
  try {
    await exec("whisper", [
      audioPath,
      "--model", "base",
      "--output_format", "json",
      "--output_dir", TMP_DIR,
      "--language", "en",
    ]);

    const raw = await readFile(jsonPath, "utf-8");
    const parsed = JSON.parse(raw);

    const segments = (parsed.segments ?? []).map((s: { start: number; end: number; text: string }) => ({
      start: Math.round(s.start * 100) / 100,
      end: Math.round(s.end * 100) / 100,
      text: s.text.trim(),
    }));

    // Cleanup
    await unlink(jsonPath).catch(() => {});

    return { segments, language: parsed.language ?? "en" };
  } catch {
    // Whisper not available — return empty segments
    // The agent will still have silence detection and duration data
    console.warn(`[transcript-extractor] whisper CLI not found, returning empty transcript`);
    return { segments: [], language: "unknown" };
  }
}

const extractTranscript = createTool({
  id: "extractTranscript",
  description: "Extract and transcribe audio from a video file. Provide either a local file path or a SourceVideo ID.",
  inputSchema: z.object({
    sourceVideoId: z.string().optional().describe("SourceVideo ID to look up file path in DB"),
    localPath: z.string().optional().describe("Local file path to the video"),
  }),
  execute: async (input) => {
    const { sourceVideoId, localPath } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { sourceVideoId?: string; localPath?: string }) => {
        let videoPath = input.localPath;

        // Resolve video path from SourceVideo if needed
        if (!videoPath && input.sourceVideoId) {
          const sv = await db.sourceVideo.findUnique({
            where: { id: input.sourceVideoId },
            select: { url: true, metadata: true },
          });
          if (!sv) throw new Error(`SourceVideo ${input.sourceVideoId} not found`);

          // Check if metadata has a local/R2 path
          const meta = sv.metadata as Record<string, unknown> | null;
          videoPath = (meta?.localPath as string) ?? (meta?.r2Key as string);

          if (!videoPath) {
            throw new Error(`No local path or R2 key found for SourceVideo ${input.sourceVideoId}`);
          }
        }

        if (!videoPath) throw new Error("Either sourceVideoId or localPath must be provided");

        // Get video duration
        const duration = await getVideoDuration(videoPath);

        // Extract audio
        const audioPath = await extractAudio(videoPath);

        // Detect silence segments
        const silences = await detectSilence(audioPath);

        // Transcribe
        const { segments, language } = await transcribeAudio(audioPath);

        // Calculate speech ratio
        const totalSilenceDuration = silences.reduce((sum, s) => sum + (s.end - s.start), 0);
        const speechRatio = duration > 0 ? Math.round((1 - totalSilenceDuration / duration) * 100) / 100 : 0;

        // Calculate pacing metrics
        const allText = segments.map((s) => s.text).join(" ");
        const wordCount = allText.split(/\s+/).filter(Boolean).length;
        const speechDuration = duration - totalSilenceDuration;
        const wpm = speechDuration > 0 ? Math.round((wordCount / speechDuration) * 60) : 0;
        const sentences = allText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
        const avgSentenceLength = sentences.length > 0
          ? Math.round(wordCount / sentences.length)
          : 0;
        const longestPause = silences.length > 0
          ? Math.round(Math.max(...silences.map((s) => s.end - s.start)) * 100) / 100
          : 0;

        // Build transcript with silence/music markers
        const transcript: Array<{ start: number; end: number; text: string; type: string }> = [];
        for (const seg of segments) {
          transcript.push({ ...seg, type: "speech" });
        }
        for (const sil of silences) {
          if (sil.end - sil.start > 1.0) {
            transcript.push({ start: sil.start, end: sil.end, text: "[silence]", type: "silence" });
          }
        }
        transcript.sort((a, b) => a.start - b.start);

        // Cleanup temp audio file
        await unlink(audioPath).catch(() => {});

        return {
          transcript,
          hookSegment: segments.length > 0 ? segments[0] : null,
          ctaSegment: segments.length > 0 ? segments[segments.length - 1] : null,
          pacing: { wordsPerMinute: wpm, averageSentenceLength: avgSentenceLength, longestPause },
          totalDuration: Math.round(duration * 100) / 100,
          speechRatio,
          language,
          segmentCount: segments.length,
          silenceCount: silences.length,
        };
      },
      { agentName: AGENT_NAME, toolName: "extractTranscript" },
    );
    return wrappedFn({ sourceVideoId, localPath });
  },
});

const getVideoMetadata = createTool({
  id: "getVideoMetadata",
  description: "Get technical metadata for a video file (resolution, codec, fps, bitrate)",
  inputSchema: z.object({
    localPath: z.string().describe("Local file path to the video"),
  }),
  execute: async (input) => {
    const { localPath } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { localPath: string }) => {
        const probeJson = await exec("ffprobe", [
          "-v", "error",
          "-show_streams", "-show_format",
          "-of", "json",
          input.localPath,
        ]);
        const probe = JSON.parse(probeJson);

        const videoStream = probe.streams?.find((s: Record<string, unknown>) => s.codec_type === "video");
        const audioStream = probe.streams?.find((s: Record<string, unknown>) => s.codec_type === "audio");

        return {
          duration: parseFloat(probe.format?.duration ?? "0"),
          size: parseInt(probe.format?.size ?? "0", 10),
          bitrate: parseInt(probe.format?.bit_rate ?? "0", 10),
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: eval(videoStream.r_frame_rate ?? "0") || 0,
            pixelFormat: videoStream.pix_fmt,
          } : null,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            sampleRate: parseInt(audioStream.sample_rate ?? "0", 10),
            channels: audioStream.channels,
            bitrate: parseInt(audioStream.bit_rate ?? "0", 10),
          } : null,
        };
      },
      { agentName: AGENT_NAME, toolName: "getVideoMetadata" },
    );
    return wrappedFn({ localPath });
  },
});

const transcriptExtractorAgent = new Agent({
  id: 'transcript-extractor',
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { extractTranscript, getVideoMetadata },
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

  const result = await transcriptExtractorAgent.generate(prompt, {
    instructions: systemPrompt,
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
