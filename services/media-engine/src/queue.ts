import PgBoss from "pg-boss";
import { uploadToR2 } from "./r2.js";

const QUEUE_NAME = "media:task";

export interface MediaJob {
  type: "download" | "transform";
  organizationId: string;
  sourceUrl?: string;
  localPath?: string;
  outputKey?: string;
  transforms?: Record<string, unknown>;
}

export interface MediaJobResult {
  success: boolean;
  r2Key?: string;
  error?: string;
}

async function handleDownload(job: MediaJob): Promise<MediaJobResult> {
  // Chunk 2 implements yt-dlp wrapper — placeholder dispatch point
  const { sourceUrl } = job;
  if (!sourceUrl) {
    return { success: false, error: "sourceUrl required for download job" };
  }
  // Will call download(sourceUrl) from download.ts (Chunk 2)
  // Then upload result to R2
  return { success: false, error: "download handler not yet implemented" };
}

async function handleTransform(job: MediaJob): Promise<MediaJobResult> {
  // Chunk 2 implements FFmpeg pipeline — placeholder dispatch point
  const { localPath } = job;
  if (!localPath) {
    return { success: false, error: "localPath required for transform job" };
  }
  // Will call ffmpeg pipeline from ffmpeg.ts (Chunk 2)
  // Then upload result to R2
  return { success: false, error: "transform handler not yet implemented" };
}

async function processJob(job: MediaJob): Promise<MediaJobResult> {
  switch (job.type) {
    case "download":
      return handleDownload(job);
    case "transform":
      return handleTransform(job);
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
      console.log(`[media:task] processing job ${job.id} type=${job.data.type}`);
      const result = await processJob(job.data);

      if (!result.success) {
        console.error(`[media:task] job ${job.id} failed: ${result.error}`);
        throw new Error(result.error);
      }

      console.log(`[media:task] job ${job.id} complete, r2Key=${result.r2Key}`);
    }
  });

  return boss;
}
