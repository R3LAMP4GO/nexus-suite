import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const AGENT_NAME = "caption-generator";
const TMP_DIR = "/tmp";

const INSTRUCTIONS = `You are the Caption Generator for Nexus Suite.

You create and style video captions optimised for social media engagement. Captions are critical — 80%+ of short-form viewers watch without sound. Your captions must be attention-grabbing, perfectly timed, and visually striking.

Caption styles:
1. **Karaoke** — Word-by-word highlight as spoken. Best for TikTok/Reels. Uses ASS subtitle format with \\kf tags.
2. **Block** — 2-4 words at a time, centred, bold. Good for motivational/speaking content.
3. **Typewriter** — Words appear one at a time with typing animation. Good for storytelling.
4. **Minimal** — Small, lower-third, clean. Good for professional/LinkedIn content.

Caption rules:
- MAXIMUM 7 words per caption line on screen
- Highlight KEY words (action verbs, numbers, emotional words) in accent color
- Never overlap captions with important visual elements
- Time captions to speech — never early, never late
- Add emphasis marks (\\b1 bold) for hook words
- Use \\N for line breaks, never more than 2 lines at once

Timing rules:
- Each word block should be visible for 0.3-0.8 seconds minimum
- Gap between blocks: 50-150ms (feels snappy but readable)
- Hook captions (first 3 seconds): LARGER font, center-screen
- CTA captions (last 3 seconds): accent color, center-screen

Output format:
Return JSON with:
- "captions": array of { start (seconds), end (seconds), text, style, emphasis (boolean) }
- "assContent": the full ASS subtitle file content (ready to write to disk)
- "style": { fontName, fontSize, primaryColor, highlightColor, outlineColor, position }
- "wordCount": total words captioned
- "coverage": percentage of video duration covered by captions`;

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
}

function formatAssTimestamp(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function cssHexToAssBgr(hex: string): string {
  const clean = hex.replace("#", "");
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H00${b}${g}${r}`;
}

const generateCaptions = createTool({
  id: "generateCaptions",
  description: "Generate timed caption data from a transcript. Returns both structured caption data and a ready-to-use ASS subtitle file.",
  inputSchema: z.object({
    transcript: z.array(z.object({
      start: z.number(),
      end: z.number(),
      text: z.string(),
    })).describe("Transcript segments with timestamps"),
    style: z.enum(["karaoke", "block", "typewriter", "minimal"]).default("karaoke").describe("Caption display style"),
    resolution: z.object({
      width: z.number().default(1080),
      height: z.number().default(1920),
    }).optional().describe("Video resolution for positioning"),
    fontName: z.string().default("Arial").describe("Font family"),
    highlightColor: z.string().default("#FFFF00").describe("Accent/highlight color in hex"),
    totalDuration: z.number().optional().describe("Total video duration in seconds"),
  }),
  execute: async (input) => {
    const ctx = input;
    const wrappedFn = wrapToolHandler(
      async (input: {
        transcript: Array<{ start: number; end: number; text: string }>;
        style: string;
        resolution?: { width: number; height: number };
        fontName: string;
        highlightColor: string;
        totalDuration?: number;
      }) => {
        const res = input.resolution ?? { width: 1080, height: 1920 };
        const fontSize = Math.round(res.height * 0.045);
        const isVertical = res.width * 16 <= res.height * 9;
        const marginV = isVertical ? Math.round(res.height * 0.35) : Math.round(res.height * 0.05);
        const highlightBgr = cssHexToAssBgr(input.highlightColor);

        // Split transcript into word-level chunks
        const wordChunks: Array<{ text: string; start: number; end: number }> = [];
        for (const seg of input.transcript) {
          const words = seg.text.trim().split(/\s+/);
          if (words.length === 0) continue;
          const segDuration = seg.end - seg.start;
          const wordDuration = segDuration / words.length;

          for (let i = 0; i < words.length; i++) {
            wordChunks.push({
              text: words[i],
              start: seg.start + i * wordDuration,
              end: seg.start + (i + 1) * wordDuration,
            });
          }
        }

        // Group words into display lines (3-5 words per line based on style)
        const wordsPerGroup = input.style === "karaoke" ? 4 : input.style === "block" ? 3 : input.style === "typewriter" ? 1 : 5;
        const groups: Array<{ words: typeof wordChunks; start: number; end: number; text: string }> = [];
        for (let i = 0; i < wordChunks.length; i += wordsPerGroup) {
          const slice = wordChunks.slice(i, i + wordsPerGroup);
          groups.push({
            words: slice,
            start: slice[0].start,
            end: slice[slice.length - 1].end,
            text: slice.map((w) => w.text).join(" "),
          });
        }

        // Build ASS file
        const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: ${res.width}
PlayResY: ${res.height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${input.fontName},${fontSize},&H00FFFFFF,${highlightBgr},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

        let dialogueLines: string[];

        if (input.style === "karaoke") {
          // Karaoke: word-by-word highlight using \kf tags
          dialogueLines = groups.map((group) => {
            const karaokeText = group.words
              .map((w) => `{\\kf${Math.round((w.end - w.start) * 100)}}${w.text}`)
              .join(" ");
            return `Dialogue: 0,${formatAssTimestamp(group.start * 1000)},${formatAssTimestamp(group.end * 1000)},Caption,,0,0,0,,${karaokeText}`;
          });
        } else if (input.style === "typewriter") {
          // Typewriter: progressive reveal
          dialogueLines = groups.map((group) => {
            return `Dialogue: 0,${formatAssTimestamp(group.start * 1000)},${formatAssTimestamp(group.end * 1000)},Caption,,0,0,0,,{\\fad(100,0)}${group.text}`;
          });
        } else {
          // Block/minimal: simple timed text
          dialogueLines = groups.map((group) => {
            return `Dialogue: 0,${formatAssTimestamp(group.start * 1000)},${formatAssTimestamp(group.end * 1000)},Caption,,0,0,0,,${group.text}`;
          });
        }

        const assContent = assHeader + "\n" + dialogueLines.join("\n") + "\n";

        // Calculate coverage
        const totalCaptionDuration = groups.reduce((sum, g) => sum + (g.end - g.start), 0);
        const totalDuration = input.totalDuration ?? (wordChunks.length > 0 ? wordChunks[wordChunks.length - 1].end : 0);
        const coverage = totalDuration > 0 ? Math.round((totalCaptionDuration / totalDuration) * 100) : 0;

        return {
          captions: groups.map((g) => ({
            start: Math.round(g.start * 100) / 100,
            end: Math.round(g.end * 100) / 100,
            text: g.text,
            style: input.style,
            wordCount: g.words.length,
          })),
          assContent,
          style: {
            fontName: input.fontName,
            fontSize,
            primaryColor: "#FFFFFF",
            highlightColor: input.highlightColor,
            outlineColor: "#000000",
            position: isVertical ? "center-mid" : "bottom-center",
          },
          wordCount: wordChunks.length,
          captionGroups: groups.length,
          coverage,
        };
      },
      { agentName: AGENT_NAME, toolName: "generateCaptions" },
    );
    return wrappedFn({
      transcript: ctx.transcript,
      style: ctx.style ?? "word-by-word",
      resolution: ctx.resolution as { width: number; height: number } | undefined,
      fontName: ctx.fontName ?? "Arial",
      highlightColor: ctx.highlightColor ?? "#FFFF00",
      totalDuration: ctx.totalDuration,
    });
  },
});

const burnCaptions = createTool({
  id: "burnCaptions",
  description: "Burn ASS captions into a video file using FFmpeg. Returns the path to the captioned video.",
  inputSchema: z.object({
    videoPath: z.string().describe("Input video file path"),
    assContent: z.string().describe("ASS subtitle file content"),
  }),
  execute: async (input) => {
    const { videoPath, assContent } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { videoPath: string; assContent: string }) => {
        const assPath = join(TMP_DIR, `captions-${randomUUID().slice(0, 8)}.ass`);
        const outPath = join(TMP_DIR, `captioned-${randomUUID().slice(0, 8)}.mp4`);

        await writeFile(assPath, input.assContent, "utf-8");

        // Escape the ASS path for FFmpeg filter
        const escapedAssPath = assPath
          .replace(/\\/g, "/")
          .replace(/:/g, "\\:")
          .replace(/'/g, "\\'");

        await exec("ffmpeg", [
          "-y", "-i", input.videoPath,
          "-vf", `ass=${escapedAssPath}`,
          "-c:v", "libx264", "-preset", "fast", "-crf", "23",
          "-c:a", "copy",
          "-movflags", "+faststart",
          outPath,
        ]);

        // Cleanup ASS temp file
        await unlink(assPath).catch(() => {});

        const { stat: fsStat } = await import("node:fs/promises");
        const fileStat = await fsStat(outPath);

        return {
          outputPath: outPath,
          size: fileStat.size,
        };
      },
      { agentName: AGENT_NAME, toolName: "burnCaptions" },
    );
    return wrappedFn({ videoPath, assContent });
  },
});

const captionGeneratorAgent = new Agent({
  id: 'caption-generator',
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { generateCaptions, burnCaptions },
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

  const result = await captionGeneratorAgent.generate(prompt, {
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
