import { postContent } from "@/server/services/posting";
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

      await postContent(orgId, accountId, variationId, platform, postRecordId);
    },
  );
}

export async function stopPostWorker(): Promise<void> {
  // No-op: pg-boss lifecycle is managed by the shared singleton in src/lib/pg-boss.ts
}
