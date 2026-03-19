import PgBoss from "pg-boss";
import { uploadToR2 } from "./r2.js";
import { download } from "./download.js";
import { runPipeline, runRaw } from "./ffmpeg.js";
import { ensureAudioSafe, type AudioAnalysis } from "./audio-safety.js";
import type { TransformConfig, TransformFragment } from "./transforms.js";

const QUEUE_NAME = "media:task";

// Keep in sync with src/shared/queue-types.ts (canonical MediaJobPayload)
export interface MediaJob {
  type: "download" | "transform" | "audio-check";
  organizationId: string;
  sourceUrl?: string;
  localPath?: string;
  outputKey?: string;
  transforms?: TransformConfig | TransformFragment;
  /** ID of the VideoVariation record to update on completion */
  variationId?: string;
  /** Parent SourceVideo ID — used to trigger completion checks */
  sourceVideoId?: string;
}

// Keep in sync with src/shared/queue-types.ts (canonical MediaJobResult)
export interface MediaJobResult {
  success: boolean;
  r2Key?: string;
  error?: string;
  audioAnalysis?: AudioAnalysis;
  audioStripped?: boolean;
}

async function handleDownload(job: MediaJob): Promise<MediaJobResult> {
  const { sourceUrl, outputKey } = job;
  if (!sourceUrl) {
    return { success: false, error: "sourceUrl required for download job" };
  }

  const result = await download({ url: sourceUrl });
  const upload = await uploadToR2(result.localPath, outputKey);
  return { success: true, r2Key: upload.key };
}

async function handleTransform(job: MediaJob): Promise<MediaJobResult> {
  const { sourceUrl, outputKey, transforms } = job;
  if (!sourceUrl) {
    return { success: false, error: "sourceUrl required for transform job" };
  }

  // Download the source from R2/URL to a local temp path for ffmpeg
  const { localPath } = await download({ url: sourceUrl });

  // Support both TransformConfig (layer options) and raw TransformFragment
  const isFragment = transforms && "videoFilters" in transforms;
  const result = isFragment
    ? await runRaw(localPath, transforms as TransformFragment)
    : await runPipeline(localPath, transforms as TransformConfig | undefined);

  const upload = await uploadToR2(result.outputPath, outputKey);
  return { success: true, r2Key: upload.key };
}

async function handleAudioCheck(job: MediaJob): Promise<MediaJobResult> {
  const { localPath, outputKey } = job;
  if (!localPath) {
    return { success: false, error: "localPath required for audio-check job" };
  }

  const result = await ensureAudioSafe(localPath);
  let r2Key: string | undefined;

  if (result.audioStripped && outputKey) {
    const upload = await uploadToR2(result.outputPath, outputKey);
    r2Key = upload.key;
  }

  return {
    success: true,
    r2Key,
    audioAnalysis: result.analysis,
    audioStripped: result.audioStripped,
  };
}

async function processJob(job: MediaJob): Promise<MediaJobResult> {
  switch (job.type) {
    case "download":
      return handleDownload(job);
    case "transform":
      return handleTransform(job);
    case "audio-check":
      return handleAudioCheck(job);
    default:
      return { success: false, error: `unknown job type: ${(job as MediaJob).type}` };
  }
}

export async function startConsumer(): Promise<PgBoss> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for pg-boss");
  }

  const boss = new PgBoss({ connectionString });

  boss.on("error", (err) => console.error("[pg-boss] error:", err));

  await boss.start();
  console.log(`[pg-boss] started, subscribing to ${QUEUE_NAME}`);

  await boss.work<MediaJob>(QUEUE_NAME, async (jobs) => {
    for (const job of jobs) {
      const { variationId, sourceVideoId, organizationId } = job.data;
      console.log(`[media:task] processing job ${job.id} type=${job.data.type}`);

      let result: MediaJobResult;
      try {
        result = await processJob(job.data);
      } catch (err) {
        // On unhandled error, mark variation as failed if we have a variationId
        if (variationId) {
          await updateVariationStatus(boss, variationId, "failed", null);
          if (sourceVideoId) {
            await enqueueMediaComplete(boss, organizationId, sourceVideoId, variationId);
          }
        }
        throw err;
      }

      if (!result.success) {
        console.error(`[media:task] job ${job.id} failed: ${result.error}`);
        if (variationId) {
          await updateVariationStatus(boss, variationId, "failed", null);
          if (sourceVideoId) {
            await enqueueMediaComplete(boss, organizationId, sourceVideoId, variationId);
          }
        }
        throw new Error(result.error);
      }

      // Update VideoVariation record with result
      if (variationId) {
        await updateVariationStatus(boss, variationId, "ready", result.r2Key ?? null);
        if (sourceVideoId) {
          await enqueueMediaComplete(boss, organizationId, sourceVideoId, variationId);
        }
      }

      console.log(`[media:task] job ${job.id} complete, r2Key=${result.r2Key}`);
    }
  });

  return boss;
}

// ── DB helpers ──────────────────────────────────────────────────
// The media-engine is a standalone microservice without Prisma.
// We use pg-boss's internal DB connection to run raw SQL updates
// against the VideoVariation table, then enqueue a media:complete
// job so the main app can trigger notifications.

const COMPLETE_QUEUE = "media:complete";

async function updateVariationStatus(
  boss: PgBoss,
  variationId: string,
  status: "ready" | "failed",
  r2Key: string | null,
): Promise<void> {
  try {
    await boss.getDb().executeSql(
      `UPDATE "VideoVariation"
         SET "status" = $1,
             "r2StorageKey" = COALESCE($2, "r2StorageKey"),
             "updatedAt" = now()
       WHERE "id" = $3`,
      [status, r2Key, variationId],
    );
    console.log(`[media:task] updated variation ${variationId} → ${status}`);
  } catch (err) {
    console.error(`[media:task] failed to update variation ${variationId}:`, err);
  }
}

async function enqueueMediaComplete(
  boss: PgBoss,
  organizationId: string,
  sourceVideoId: string,
  variationId: string,
): Promise<void> {
  try {
    await boss.send(COMPLETE_QUEUE, { organizationId, sourceVideoId, variationId });
  } catch (err) {
    console.error(`[media:task] failed to enqueue media:complete for ${variationId}:`, err);
  }
}
