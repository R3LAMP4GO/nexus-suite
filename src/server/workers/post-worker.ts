import { postContent } from "@/server/services/posting";
import { canPost } from "@/server/services/circuit-breaker";
import { publishSSE } from "@/server/services/sse-broadcaster";
import { incCounter, observeHistogram } from "@/lib/metrics";
import { db } from "@/lib/db";
import { getBoss } from "@/lib/pg-boss";
import type { Platform } from "@/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────

interface PostTaskPayload {
  orgId: string;
  accountId: string;
  variationId: string;
  platform: Platform;
  postRecordId: string;
}

// ── Worker ────────────────────────────────────────────────────

const QUEUE_NAME = "post:task";

export async function startPostWorker(): Promise<void> {
  const b = await getBoss();

  await b.work<PostTaskPayload>(
    QUEUE_NAME,
    { batchSize: 1 },
    async ([job]) => {
      const { orgId, accountId, variationId, platform, postRecordId } = job.data;

      // Verify PostRecord still exists and is SCHEDULED
      const record = await db.postRecord.findUnique({
        where: { id: postRecordId },
        select: { status: true },
      });

      if (!record) return;
      if (record.status !== "SCHEDULED") return;

      // Check circuit breaker state before posting — state may have changed since scheduling
      const circuitCheck = await canPost(accountId);
      if (!circuitCheck.allowed) {
        await db.postRecord.update({
          where: { id: postRecordId },
          data: { status: "SKIPPED", errorMessage: `Circuit breaker: ${circuitCheck.reason}` },
        });
        return;
      }

      const startMs = Date.now();
      incCounter("posts_attempted_total", { platform }).catch(() => {});

      try {
        await postContent(orgId, accountId, variationId, platform, postRecordId);
        incCounter("posts_succeeded_total", { platform }).catch(() => {});
        await publishSSE(orgId, "post:complete", { postRecordId, status: "success" }).catch(() => {});
      } catch (err) {
        incCounter("posts_failed_total", { platform }).catch(() => {});
        await publishSSE(orgId, "post:complete", { postRecordId, status: "failed" }).catch(() => {});
        throw err;
      } finally {
        observeHistogram("post_duration_seconds", {}, (Date.now() - startMs) / 1000).catch(() => {});
      }
    },
  );
}

export async function stopPostWorker(): Promise<void> {
  // No-op: pg-boss lifecycle is managed by the shared singleton in src/lib/pg-boss.ts
}
