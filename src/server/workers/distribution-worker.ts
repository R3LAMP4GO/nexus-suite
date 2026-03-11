import { db } from "@/lib/db";
import { getBoss } from "@/lib/pg-boss";
import { scheduleDistribution } from "@/server/services/distribution-scheduler";
import type { Platform } from "@/generated/prisma/client";

// ── Constants ────────────────────────────────────────────────

const QUEUE_NAME = "distribution:schedule";
const CRON_EXPRESSION = "*/15 * * * *"; // every 15 minutes

// ── Worker ──────────────────────────────────────────────────

/**
 * Find all ready variations that have NOT yet been distributed
 * (i.e. no PostRecord exists for them), grouped by org, then
 * call `scheduleDistribution` for each.
 */
async function processDistributionCycle(): Promise<void> {
  // Find all ready variations that have zero post records
  const pendingVariations = await db.videoVariation.findMany({
    where: {
      status: "ready",
      postRecords: { none: {} },
    },
    select: {
      id: true,
      sourceVideo: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  if (pendingVariations.length === 0) {
    console.log("[distribution-worker] no pending variations found");
    return;
  }

  // Find all distinct platforms with non-OPEN accounts per org, so we know
  // which platforms to target for each org
  const orgIds = [...new Set(pendingVariations.map((v) => v.sourceVideo.organizationId))];

  const orgPlatforms = new Map<string, Platform[]>();
  for (const orgId of orgIds) {
    const accounts = await db.orgPlatformToken.findMany({
      where: {
        organizationId: orgId,
        circuitState: { not: "OPEN" },
      },
      select: { platform: true },
      distinct: ["platform"],
    });
    if (accounts.length > 0) {
      orgPlatforms.set(orgId, accounts.map((a) => a.platform));
    }
  }

  let scheduled = 0;
  let skipped = 0;

  for (const variation of pendingVariations) {
    const orgId = variation.sourceVideo.organizationId;
    const platforms = orgPlatforms.get(orgId);

    if (!platforms || platforms.length === 0) {
      console.log(`[distribution-worker] no eligible platforms for org=${orgId}, skipping variation=${variation.id}`);
      continue;
    }

    try {
      const result = await scheduleDistribution(orgId, variation.id, platforms);
      scheduled += result.scheduled;
      skipped += result.skipped;
      console.log(
        `[distribution-worker] variation=${variation.id} org=${orgId} scheduled=${result.scheduled} skipped=${result.skipped}`,
      );
    } catch (err) {
      console.error(`[distribution-worker] failed for variation=${variation.id} org=${orgId}:`, err);
    }
  }

  console.log(`[distribution-worker] cycle complete: scheduled=${scheduled} skipped=${skipped}`);
}

export async function startDistributionWorker(): Promise<void> {
  const boss = await getBoss();

  // Register the cron schedule — pg-boss deduplicates via singletonKey
  await boss.schedule(QUEUE_NAME, CRON_EXPRESSION, {}, {
    singletonKey: "distribution-scheduler",
  });

  await boss.work(QUEUE_NAME, { batchSize: 1 }, async () => {
    console.log("[distribution-worker] starting distribution cycle...");
    await processDistributionCycle();
  });

  console.log(`[distribution-worker] registered cron: ${CRON_EXPRESSION}`);
}

export async function stopDistributionWorker(): Promise<void> {
  // No-op: pg-boss lifecycle is managed by the shared singleton in src/lib/pg-boss.ts
}
