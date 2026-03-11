import type PgBoss from "pg-boss";
import { db } from "@/lib/db";
import { incCounter } from "@/lib/metrics";
import { postContent } from "@/server/services/posting";
import { canPost } from "@/server/services/circuit-breaker";
import { publishSSE } from "@/server/services/sse-broadcaster";
import type { ContentPublishJob } from "../types.js";
import type { Platform } from "@/generated/prisma/client";

export async function handleContentPublish(
  job: PgBoss.Job<ContentPublishJob>,
): Promise<void> {
  const { contentId, platformIds, organizationId } = job.data;

  // Resolve content — contentId is a SourceVideo id
  const sourceVideo = await db.sourceVideo.findUnique({
    where: { id: contentId },
    include: {
      variations: {
        where: { status: "ready" },
        select: { id: true },
      },
    },
  });

  if (!sourceVideo) {
    console.error(`[content-publish] source video not found: ${contentId}`);
    return;
  }

  if (sourceVideo.variations.length === 0) {
    console.error(`[content-publish] no ready variations for content: ${contentId}`);
    return;
  }

  // Find accounts matching the requested platforms
  const accounts = await db.orgPlatformToken.findMany({
    where: {
      organizationId,
      platform: { in: platformIds as Platform[] },
      circuitState: { not: "OPEN" },
    },
    select: { id: true, platform: true },
  });

  if (accounts.length === 0) {
    console.error(`[content-publish] no eligible accounts for platforms: ${platformIds.join(",")}`);
    return;
  }

  // Post each variation to each matching account
  const variation = sourceVideo.variations[0]!;

  for (const account of accounts) {
    try {
      const circuitCheck = await canPost(account.id);
      if (!circuitCheck.allowed) {
        console.warn(
          `[content-publish] circuit breaker blocked account=${account.id} platform=${account.platform}`,
        );
        continue;
      }

      const postRecord = await db.postRecord.create({
        data: {
          organizationId,
          accountId: account.id,
          variationId: variation.id,
          platform: account.platform,
          scheduledAt: new Date(),
          status: "SCHEDULED",
        },
      });

      await postContent(
        organizationId,
        account.id,
        variation.id,
        account.platform,
        postRecord.id,
      );
    } catch (err) {
      console.error(
        `[content-publish] failed for account=${account.id} platform=${account.platform}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  incCounter("content_published_total", {}).catch(() => {});
  await publishSSE(organizationId, "content:published", { contentId }).catch(() => {});
}
