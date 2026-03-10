// Combinatorial video stitcher — ported from R3LAMP4GO/batchedit.
// Concatenates Hook + Meat + CTA clips with FFmpeg, normalizing resolution,
// applying ASS captions (karaoke word highlighting), and text overlays.

import ffmpegCmd from "fluent-ffmpeg";
import { join, normalize } from "path";
import { writeFileSync, mkdirSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import type { RenderJob, RenderProgress, WordChunk, CaptionSegment } from "./batch-render.types";

const MAX_CONCURRENT = Math.max(1, Math.floor(require("os").cpus().length / 2));

// ── Path escaping for FFmpeg filter graphs ──────────────────────

function escapeFilterPath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/:/g, "\\\\:")
    .replace(/'/g, "\\\\'")
    .replace(/\[/g, "\\\\[")
    .replace(/\]/g, "\\\\]");
}

function cssHexToAssBgr(hex: string): string {
  const clean = hex.replace("#", "");
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H00${b}${g}${r}`;
}

// ── ASS Subtitle Generation ─────────────────────────────────────

export function formatAssTimestamp(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function generateAssFile(
  captions: WordChunk[],
  resolution: { width: number; height: number },
): string {
  const { width, height } = resolution;
  const fontSize = Math.round(height * 0.04);
  const isVertical = width * 16 <= height * 9;
  const marginV = isVertical ? Math.round(height * 0.08) : Math.round(height * 0.03);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,8,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const lines = captions.map((cap) => {
    const start = formatAssTimestamp(cap.start);
    const end = formatAssTimestamp(cap.end);
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${cap.text.replace(/\n/g, "\\N")}`;
  });

  return header + "\n" + lines.join("\n") + "\n";
}

export function generateWordHighlightAssFile(
  wordChunks: WordChunk[],
  resolution: { width: number; height: number },
  style?: { fontName: string; highlightColor: string },
): string {
  const { width, height } = resolution;
  const fontSize = Math.round(height * 0.05);
  const isVertical = width * 16 <= height * 9;
  const marginV = isVertical ? Math.round(height * 0.35) : Math.round(height * 0.05);
  const fontName = style?.fontName || "Arial";
  const highlightBgr = style ? cssHexToAssBgr(style.highlightColor) : "&H0000FFFF";

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${fontName},${fontSize},${highlightBgr},&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  // Group words into display lines of ~4 words
  const groups: WordChunk[][] = [];
  for (let i = 0; i < wordChunks.length; i += 4) {
    groups.push(wordChunks.slice(i, i + 4));
  }

  const dialogueLines = groups.map((lineWords) => {
    const lineStart = lineWords[0].start * 1000;
    const lineEnd = lineWords[lineWords.length - 1].end * 1000;
    const karaokeText = lineWords
      .map((w) => `{\\kf${Math.round((w.end - w.start) * 100)}}${w.text}`)
      .join(" ");
    return `Dialogue: 0,${formatAssTimestamp(lineStart)},${formatAssTimestamp(lineEnd)},Karaoke,,0,0,0,,${karaokeText}`;
  });

  return header + "\n" + dialogueLines.join("\n") + "\n";
}

export function generateCombinedAssFile(
  segments: CaptionSegment[],
  resolution: { width: number; height: number },
  style?: { fontName: string; highlightColor: string },
): string {
  const allChunks: WordChunk[] = [];
  for (const seg of segments) {
    const offsetSec = seg.offsetMs / 1000;
    for (const chunk of seg.wordChunks) {
      allChunks.push({
        text: chunk.text,
        start: chunk.start + offsetSec,
        end: chunk.end + offsetSec,
      });
    }
  }
  return generateWordHighlightAssFile(allChunks, resolution, style);
}

// ── FFmpeg Concat + Normalize ──────────────────────────────────

export function concatWithNormalization(
  job: RenderJob,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const hookPath = normalize(job.hookPath);
    const meatPath = normalize(job.meatPath);
    const ctaPath = normalize(job.ctaPath);
    const outputPath = normalize(job.outputPath);
    const { width, height } = job.resolution;

    const scaleFilter = (idx: number): string =>
      job.autoResize
        ? `[${idx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=30,setpts=PTS-STARTPTS[v${idx}]`
        : `[${idx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30,setpts=PTS-STARTPTS[v${idx}]`;

    const filters = [
      scaleFilter(0),
      scaleFilter(1),
      scaleFilter(2),
      `[v0][0:a][v1][1:a][v2][2:a]concat=n=3:v=1:a=1[vout][aout]`,
    ];

    const tempAssFiles: string[] = [];
    let currentLabel = "[vout]";

    // Text overlay on hook segment
    if (job.textOverlay && job.hookDurationSec) {
      const assPath = join(tmpdir(), `batchedit-textoverlay-${randomUUID()}.ass`);
      const assContent = generateTextOverlayAss(job.textOverlay, job.hookDurationSec, job.resolution);
      writeFileSync(assPath, assContent, "utf-8");
      tempAssFiles.push(assPath);
      filters.push(`${currentLabel}ass=${escapeFilterPath(assPath)}[vtxt]`);
      currentLabel = "[vtxt]";
    }

    // ASS captions (karaoke)
    if (job.captionsAssPath) {
      filters.push(`${currentLabel}ass=${escapeFilterPath(job.captionsAssPath)}[vfinal]`);
      currentLabel = "[vfinal]";
    }

    const command = ffmpegCmd()
      .input(hookPath)
      .input(meatPath)
      .input(ctaPath)
      .complexFilter(filters.join(";"))
      .outputOptions([
        "-y", "-map", currentLabel, "-map", "[aout]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
      ])
      .on("progress", (p) => onProgress?.(p.percent || 0))
      .on("end", () => {
        tempAssFiles.forEach((f) => { try { unlinkSync(f); } catch {} });
        resolve();
      })
      .on("error", (err, _stdout, stderr) => {
        tempAssFiles.forEach((f) => { try { unlinkSync(f); } catch {} });
        reject(new Error(stderr ? `${err.message}\n${stderr}` : err.message));
      });

    command.save(outputPath);
  });
}

// ── Text overlay ASS ────────────────────────────────────────────

function generateTextOverlayAss(
  text: string,
  durationSec: number,
  resolution: { width: number; height: number },
): string {
  const { width, height } = resolution;
  const fontSize = Math.round(height * 0.035);
  const isVertical = width * 16 <= height * 9;
  const marginV = isVertical ? Math.round(height * 0.12) : Math.round(height * 0.03);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TextOverlay,Arial,${fontSize},&H00000000,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,8,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const start = formatAssTimestamp(0);
  const end = formatAssTimestamp(durationSec * 1000);
  return header + `\nDialogue: 0,${start},${end},TextOverlay,,0,0,0,,${text.replace(/\n/g, "\\N")}\n`;
}

// ── Combinatorial Generation ────────────────────────────────────

export function generateCombinations<T>(hooks: T[], meats: T[], ctas: T[]): Array<{ hook: T; meat: T; cta: T }> {
  const combos: Array<{ hook: T; meat: T; cta: T }> = [];
  for (const hook of hooks) {
    for (const meat of meats) {
      for (const cta of ctas) {
        combos.push({ hook, meat, cta });
      }
    }
  }
  return combos;
}

// ── Batch Render ────────────────────────────────────────────────

export async function batchRender(
  jobs: RenderJob[],
  onProgress?: (results: RenderProgress[]) => void,
): Promise<RenderProgress[]> {
  const results: RenderProgress[] = jobs.map((j) => ({
    jobId: j.id,
    percent: 0,
    status: "queued" as const,
  }));

  if (jobs.length > 0) {
    const outDir = join(jobs[0].outputPath, "..");
    mkdirSync(outDir, { recursive: true });
  }

  const queue = [...jobs];

  async function processNext(): Promise<void> {
    const job = queue.shift();
    if (!job) return;

    const idx = jobs.findIndex((j) => j.id === job.id);
    results[idx].status = "rendering";
    onProgress?.(results);

    try {
      await concatWithNormalization(job, (percent) => {
        results[idx].percent = percent;
        onProgress?.(results);
      });
      results[idx].status = "done";
      results[idx].percent = 100;
    } catch (err: any) {
      results[idx].status = "error";
      results[idx].error = err.message;
    }

    onProgress?.(results);
    await processNext();
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT, jobs.length) },
    () => processNext(),
  );
  await Promise.all(workers);

  return results;
}
