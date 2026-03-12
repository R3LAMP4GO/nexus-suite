import type PgBoss from "pg-boss";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { incCounter } from "@/lib/metrics";
import { db } from "@/lib/db";
import { downloadFile, uploadStream } from "@/server/services/r2-storage";
import { publishSSE } from "@/server/services/sse-broadcaster";
import { enqueueMediaComplete } from "@/server/workers/media-completion-worker";
import type { MediaRenderJob } from "../types.js";
import type { RenderJob, RenderProgress } from "../../../../../services/media-engine/src/batch-render.types";
import {
  generateCombinations,
  batchRender,
} from "../../../../../services/media-engine/src/batch-render";

const TMP_DIR = "/tmp/media-render";

// ── Helpers ─────────────────────────────────────────────────────

async function ensureTmpDir(subdir: string): Promise<string> {
  const dir = join(TMP_DIR, subdir);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Download an R2 key to a local temp file.
 * Returns the local file path.
 */
async function downloadClip(r2Key: string, workDir: string): Promise<string> {
  const ext = r2Key.split(".").pop() ?? "mp4";
  const localPath = join(workDir, `${randomUUID().slice(0, 8)}.${ext}`);
  const buffer = await downloadFile(r2Key);
  await writeFile(localPath, buffer);
  return localPath;
}

/**
 * Upload a local rendered file to R2.
 * Returns the R2 key.
 */
async function uploadRendered(
  localPath: string,
  organizationId: string,
): Promise<string> {
  const key = `videos/${organizationId}/render-${randomUUID().slice(0, 8)}.mp4`;
  const stream = createReadStream(localPath);
  await uploadStream(key, stream, "video/mp4");
  return key;
}

/**
 * Clean up temp files. Best-effort, never throws.
 */
async function cleanupFiles(paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map((p) => unlink(p).catch(() => {})));
}

// ── Handler ─────────────────────────────────────────────────────

export async function handleMediaRender(
  job: PgBoss.Job<MediaRenderJob>,
): Promise<void> {
  const {
    organizationId,
    sourceVideoId,
    hookClips,
    meatClips,
    ctaClips,
    resolution,
    autoResize,
    textOverlay,
    hookDurationSec,
  } = job.data;

  const jobTag = `[media-render] job=${job.id} org=${organizationId}`;
  console.log(`${jobTag} starting — hooks=${hookClips.length} meats=${meatClips.length} ctas=${ctaClips.length}`);

  // Publish progress to dashboard
  const emitProgress = (status: string, detail?: Record<string, unknown>) =>
    publishSSE(organizationId, "media:render", {
      jobId: job.id,
      sourceVideoId,
      status,
      ...detail,
    }).catch(() => {});

  await emitProgress("started", { totalCombinations: hookClips.length * meatClips.length * ctaClips.length });

  const workDir = await ensureTmpDir(job.id!);
  const tempFiles: string[] = [];

  try {
    // ── 1. Download all clips from R2 ────────────────────────────
    console.log(`${jobTag} downloading clips from R2...`);
    await emitProgress("downloading");

    const [hookPaths, meatPaths, ctaPaths] = await Promise.all([
      Promise.all(hookClips.map((k) => downloadClip(k, workDir))),
      Promise.all(meatClips.map((k) => downloadClip(k, workDir))),
      Promise.all(ctaClips.map((k) => downloadClip(k, workDir))),
    ]);

    tempFiles.push(...hookPaths, ...meatPaths, ...ctaPaths);

    // ── 2. Generate combinatorial render jobs ────────────────────
    const combos = generateCombinations(hookPaths, meatPaths, ctaPaths);
    console.log(`${jobTag} generated ${combos.length} combinations`);
    await emitProgress("rendering", { totalCombinations: combos.length });

    const outputDir = await ensureTmpDir(`${job.id!}/output`);

    const renderJobs: RenderJob[] = combos.map((combo, idx) => {
      const outputPath = join(outputDir, `variation-${idx}.mp4`);
      tempFiles.push(outputPath);
      return {
        id: `${job.id}-${idx}`,
        hookPath: combo.hook,
        meatPath: combo.meat,
        ctaPath: combo.cta,
        outputPath,
        textOverlay,
        hookDurationSec,
        autoResize,
        resolution,
      };
    });

    // ── 3. Batch render with FFmpeg ──────────────────────────────
    console.log(`${jobTag} starting batch render of ${renderJobs.length} variations...`);

    let lastProgressLog = 0;
    const results = await batchRender(renderJobs, (progress: RenderProgress[]) => {
      const done = progress.filter((p) => p.status === "done").length;
      const total = progress.length;
      const now = Date.now();
      // Throttle SSE + log updates to every 2s
      if (now - lastProgressLog > 2000) {
        lastProgressLog = now;
        emitProgress("rendering", { done, total });
        console.log(`${jobTag} render progress: ${done}/${total}`);
      }
    });

    const succeeded = results.filter((r) => r.status === "done");
    const failed = results.filter((r) => r.status === "error");

    if (failed.length > 0) {
      console.warn(`${jobTag} ${failed.length}/${results.length} renders failed`);
      for (const f of failed) {
        console.warn(`${jobTag}   ${f.jobId}: ${f.error}`);
      }
    }

    if (succeeded.length === 0) {
      throw new Error("All render combinations failed");
    }

    // ── 4. Upload rendered outputs to R2 ─────────────────────────
    console.log(`${jobTag} uploading ${succeeded.length} rendered variations to R2...`);
    await emitProgress("uploading", { count: succeeded.length });

    const variationRecords: Array<{ r2Key: string; index: number }> = [];

    for (const result of succeeded) {
      const idx = parseInt(result.jobId.split("-").pop()!, 10);
      const renderJob = renderJobs[idx]!;
      const r2Key = await uploadRendered(renderJob.outputPath, organizationId);
      variationRecords.push({ r2Key, index: idx });
    }

    // ── 5. Create VideoVariation DB records ────────────────────────
    console.log(`${jobTag} creating ${variationRecords.length} variation records...`);

    for (const rec of variationRecords) {
      const variation = await db.videoVariation.create({
        data: {
          sourceVideoId,
          variationIndex: rec.index,
          r2StorageKey: rec.r2Key,
          status: "ready",
          transforms: {},
        },
      });

      // Notify media-completion worker per variation
      await enqueueMediaComplete(organizationId, sourceVideoId, variation.id);
    }

    // ── 6. Done ──────────────────────────────────────────────────
    console.log(
      `${jobTag} complete — ${variationRecords.length} variations created, ${failed.length} failed`,
    );
    await emitProgress("complete", {
      succeeded: variationRecords.length,
      failed: failed.length,
    });

    incCounter("media_render_total", { status: "success" }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${jobTag} failed:`, message);
    await emitProgress("error", { error: message });
    incCounter("media_render_total", { status: "failed" }).catch(() => {});
    throw err;
  } finally {
    // Best-effort cleanup
    await cleanupFiles(tempFiles);
  }
}
