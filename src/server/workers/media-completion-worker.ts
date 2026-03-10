import { db } from "@/lib/db";
import { getBoss } from "@/lib/pg-boss";
import { sendVideoProcessedEmail } from "@/server/services/notifications";

// ── Types ─────────────────────────────────────────────────────

interface MediaCompletePayload {
  organizationId: string;
  sourceVideoId: string;
  variationId: string;
}

// ── Worker ────────────────────────────────────────────────────

const QUEUE_NAME = "media:complete";

/**
 * Listens for individual variation completions.
 * When ALL variations for a source video are done, sends the email notification.
 */
export async function startMediaCompletionWorker(): Promise<void> {
  const b = await getBoss();

  await b.work<MediaCompletePayload>(
    QUEUE_NAME,
    { batchSize: 1 },
    async ([job]) => {
      const { organizationId, sourceVideoId } = job.data;

      // Check if ALL variations for this source video are complete
      const sourceVideo = await db.sourceVideo.findUnique({
        where: { id: sourceVideoId },
        include: {
          variations: { select: { id: true, status: true } },
        },
      });

      if (!sourceVideo) return;

      const total = sourceVideo.variations.length;
      const completed = sourceVideo.variations.filter(
        (v) => v.status === "COMPLETED" || v.status === "FAILED",
      ).length;

      // Not all done yet — wait for more completions
      if (completed < total) return;

      const succeeded = sourceVideo.variations.filter(
        (v) => v.status === "COMPLETED",
      ).length;

      // Only notify if at least one variation succeeded
      if (succeeded === 0) {
        console.warn(
          `[media-completion] All ${total} variations failed for sourceVideo=${sourceVideoId}`,
        );
        return;
      }

      // Look up org owner email
      const owner = await db.orgMember.findFirst({
        where: { organizationId, role: "OWNER" },
        select: { user: { select: { email: true } } },
      });

      if (!owner?.user?.email) {
        console.warn(`[media-completion] No owner email for org=${organizationId}`);
        return;
      }

      try {
        await sendVideoProcessedEmail(owner.user.email, succeeded);
        console.log(
          `[media-completion] Notified ${owner.user.email}: ${succeeded}/${total} variations ready`,
        );
      } catch (err) {
        console.error("[media-completion] Failed to send notification:", err);
      }
    },
  );

  console.log(`[media-completion] Worker listening on queue: ${QUEUE_NAME}`);
}

/**
 * Call this from the media-engine when a variation finishes processing.
 * Enqueues a completion check job.
 */
export async function enqueueMediaComplete(
  organizationId: string,
  sourceVideoId: string,
  variationId: string,
): Promise<void> {
  const b = await getBoss();
  await b.send(QUEUE_NAME, { organizationId, sourceVideoId, variationId });
}

export async function stopMediaCompletionWorker(): Promise<void> {
  // No-op: pg-boss lifecycle is managed by the shared singleton in src/lib/pg-boss.ts
}
