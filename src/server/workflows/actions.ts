import { workflowLogger } from "@/lib/logger";
import { registerAction } from "./executor";
import { db } from "@/lib/db";
import { enqueueWarmTask, type WarmTask } from "../services/warming/queue";
import { scheduleDistribution } from "../services/distribution-scheduler";
import type { Platform } from "@/generated/prisma/client";

// ── Helpers ──────────────────────────────────────────────────────

interface PhaseAction {
  action: string;
  weight: number;
}

function pickWeightedAction(actions: PhaseAction[]): string {
  const totalWeight = actions.reduce((sum, a) => sum + a.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const a of actions) {
    roll -= a.weight;
    if (roll <= 0) return a.action;
  }
  return actions[actions.length - 1].action;
}

function randomTimeInDay(baseDate: Date, dayOffset: number, windowStart = 8, windowEnd = 22): Date {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + dayOffset);
  const span = windowEnd - windowStart;
  const hour = windowStart + Math.floor(Math.random() * span);
  const minute = Math.floor(Math.random() * 60);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ── Registration ─────────────────────────────────────────────────

export function registerWorkflowActions(): void {
  // ── warming.enqueuePhase ─────────────────────────────────────
  // Enqueues pg-boss warming tasks for a single phase with
  // randomised startAfter delays across the configured day range.
  registerAction("warming.enqueuePhase", async (params, context) => {
    const accountId = params.accountId as string;
    const organizationId = (params.organizationId as string) ?? context.organizationId;
    const phase = Number(params.phase);
    const dayStart = Number(params.dayStart);
    const dayEnd = Number(params.dayEnd);
    const sessionsPerDay = Number(params.sessionsPerDay);
    const actions = params.actions as PhaseAction[];

    const now = new Date();
    let enqueued = 0;

    for (let day = dayStart; day < dayEnd; day++) {
      for (let session = 0; session < sessionsPerDay; session++) {
        const action = pickWeightedAction(actions);
        const startAfter = randomTimeInDay(now, day);
        // Spread sessions within the day
        startAfter.setHours(startAfter.getHours() + session * 3);

        const task: WarmTask = {
          accountId,
          organizationId,
          action,
          phase,
        };

        await enqueueWarmTask(task, {
          startAfter,
          singletonKey: `warm:${accountId}:d${day}:s${session}`,
        });
        enqueued++;
      }
    }

    workflowLogger.info(
      `[warming.enqueuePhase] Enqueued ${enqueued} tasks for account ${accountId} phase ${phase} (days ${dayStart}-${dayEnd})`,
    );

    return { enqueued, accountId, phase };
  });

  // ── warming.markReady ────────────────────────────────────────
  // Marks the warming account as READY and enqueues the final
  // mark-ready task via pg-boss.
  registerAction("warming.markReady", async (params, context) => {
    const accountId = params.accountId as string;
    const organizationId = context.organizationId;

    // Enqueue the mark-ready task so the warming executor picks it up
    const now = new Date();
    const readyDate = randomTimeInDay(now, 1);
    await enqueueWarmTask(
      { accountId, organizationId, action: "mark-ready", phase: 4 },
      { startAfter: readyDate, singletonKey: `warm:${accountId}:ready` },
    );

    // Update DB status immediately so downstream steps can see it
    await db.orgPlatformToken.update({
      where: { id: accountId },
      data: { warmupStatus: "WARMING" },
    });

    workflowLogger.info(`[warming.markReady] Mark-ready task enqueued for account ${accountId}`);

    return { accountId, status: "mark-ready enqueued" };
  });

  // ── content.schedule ─────────────────────────────────────────
  // Schedules content for distribution on a target platform.
  // Used by daily-pipeline and content-repurpose workflows.
  registerAction("content.schedule", async (params, context) => {
    const organizationId = (params.organizationId as string) ?? context.organizationId;
    const platform = params.platform as Platform;

    // If a variationId was provided directly, schedule it
    if (params.variationId) {
      const result = await scheduleDistribution(
        organizationId,
        params.variationId as string,
        [platform],
      );
      workflowLogger.info(
        `[content.schedule] Scheduled ${result.scheduled} posts for variation ${params.variationId} on ${platform}`,
      );
      return result;
    }

    // Parse script content — agent may return structured or flat text
    const scriptContent = params.script;
    const rawText = typeof scriptContent === "string"
      ? scriptContent
      : JSON.stringify(scriptContent ?? params.variation ?? {});

    // Split content into hook/body/cta sections (best-effort parse)
    let hookText = "";
    let bodyText = rawText;
    let ctaText = "";

    if (typeof scriptContent === "object" && scriptContent !== null) {
      const s = scriptContent as Record<string, unknown>;
      hookText = String(s.hook ?? s.hookText ?? "");
      bodyText = String(s.body ?? s.bodyText ?? s.main ?? rawText);
      ctaText = String(s.cta ?? s.ctaText ?? s.callToAction ?? "");
    }

    // Persist generated content as a Script
    const title = (params.caption as string)?.slice(0, 100) ?? "Generated content";
    const script = await db.script.create({
      data: {
        organizationId,
        title,
        hookText: hookText || title,
        bodyText: bodyText || "—",
        ctaText: ctaText || "—",
        status: "DRAFT",
      },
    });

    // Create a SourceVideo placeholder linked to the script
    const sourceVideo = await db.sourceVideo.create({
      data: {
        organizationId,
        url: `workflow://${context.runId}/${script.id}`,
        platform,
        scriptId: script.id,
        metadata: {
          caption: params.caption as string | null ?? null,
          qualityScore: params.qualityScore as number | null ?? null,
          sourceContentId: params.sourceContentId as string | null ?? null,
          workflowRunId: context.runId,
        } satisfies Record<string, string | number | null>,
      },
    });

    // Create a variation record for the distribution scheduler
    const variation = await db.videoVariation.create({
      data: {
        sourceVideoId: sourceVideo.id,
        variationIndex: 0,
        transforms: {},
        caption: typeof params.caption === "string" ? params.caption : null,
        status: "ready",
      },
    });

    const result = await scheduleDistribution(organizationId, variation.id, [platform]);
    workflowLogger.info(
      `[content.schedule] Created script ${script.id}, variation ${variation.id}, scheduled ${result.scheduled} posts on ${platform}`,
    );

    return {
      scriptId: script.id,
      sourceVideoId: sourceVideo.id,
      variationId: variation.id,
      ...result,
    };
  });

  // ── content.logSkipped ───────────────────────────────────────
  // Logs when content is skipped (e.g. quality score too low).
  registerAction("content.logSkipped", async (params, context) => {
    const organizationId = (params.organizationId as string) ?? context.organizationId;
    const reason = (params.reason as string) ?? "Unknown reason";
    const feedback = params.feedback as string | undefined;

    workflowLogger.info(
      `[content.logSkipped] org=${organizationId} reason="${reason}"${feedback ? ` feedback="${feedback}"` : ""}`,
    );

    await db.workflowRunLog.update({
      where: { id: context.runId },
      data: {
        variables: {
          ...(typeof context.variables === "object" ? context.variables : {}),
          skippedReason: reason,
          skippedFeedback: feedback,
        } as any,
      },
    }).catch(() => {
      // WorkflowRunLog may not exist yet — non-critical
    });

    return { skipped: true, reason, feedback };
  });

  // ── engagement.logSkipped ────────────────────────────────────
  // Logs when engagement sweep finds nothing actionable.
  registerAction("engagement.logSkipped", async (params, context) => {
    const organizationId = (params.organizationId as string) ?? context.organizationId;
    const platform = params.platform as string;
    const reason = (params.reason as string) ?? "No actionable items";

    workflowLogger.info(
      `[engagement.logSkipped] org=${organizationId} platform=${platform} reason="${reason}"`,
    );

    return { skipped: true, platform, reason };
  });

  // ── engagement.compileReport ─────────────────────────────────
  // Compiles an engagement sweep report from analytics + responses
  // and persists it in the workflow run variables.
  registerAction("engagement.compileReport", async (params, context) => {
    const organizationId = (params.organizationId as string) ?? context.organizationId;
    const platform = params.platform as string;
    const analytics = params.analytics;
    const responses = params.responses;

    const report = {
      organizationId,
      platform,
      generatedAt: new Date().toISOString(),
      analytics: analytics ?? null,
      responses: responses ?? null,
      summary: responses
        ? "Engagement sweep completed with responses"
        : "Engagement sweep completed — no actionable items",
    };

    workflowLogger.info(
      `[engagement.compileReport] org=${organizationId} platform=${platform} report compiled`,
    );

    return report;
  });

  // ── distribution.scheduleWave ──────────────────────────────
  // Schedules a wave of posts for a specific platform with staggered
  // timing across multiple accounts.
  registerAction("distribution.scheduleWave", async (params, context) => {
    const organizationId = (params.organizationId as string) ?? context.organizationId;
    const platform = params.platform as Platform;
    const variationAssignments = params.variationAssignments as Record<string, string> | undefined;
    const intervalMinutes = Number(params.intervalMinutes ?? 60);
    const delayMinutes = Number(params.delayMinutes ?? 0);

    let scheduled = 0;
    let skipped = 0;
    const baseTime = new Date(Date.now() + delayMinutes * 60000);

    if (variationAssignments && typeof variationAssignments === "object") {
      const entries = Object.entries(variationAssignments);
      for (let i = 0; i < entries.length; i++) {
        const [, variationId] = entries[i];
        try {
          const result = await scheduleDistribution(
            organizationId,
            variationId,
            [platform],
          );
          scheduled += result.scheduled;
          skipped += result.skipped;
        } catch (err) {
          workflowLogger.error({ err, variationId }, "Failed to schedule variation in wave");
          skipped++;
        }
      }
    } else if (params.variationIds && Array.isArray(params.variationIds)) {
      for (const varId of params.variationIds as string[]) {
        try {
          const result = await scheduleDistribution(organizationId, varId, [platform]);
          scheduled += result.scheduled;
          skipped += result.skipped;
        } catch (err) {
          workflowLogger.error({ err, variationId: varId }, "Failed to schedule variation in wave");
          skipped++;
        }
      }
    }

    workflowLogger.info(
      `[distribution.scheduleWave] platform=${platform} scheduled=${scheduled} skipped=${skipped} delay=${delayMinutes}min interval=${intervalMinutes}min`,
    );

    return { platform, scheduled, skipped, baseTime: baseTime.toISOString() };
  });

  // ── distribution.crossEngage ─────────────────────────────────
  // Coordinates cross-account engagement — accounts engage with each
  // other's recent posts to boost early algorithmic signals.
  registerAction("distribution.crossEngage", async (params, context) => {
    const organizationId = (params.organizationId as string) ?? context.organizationId;
    const platform = params.platform as string;
    const delayMinutes = Number(params.delayMinutes ?? 15);

    // Find recent posts from this org on this platform (last 4 hours)
    const since = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const recentPosts = await db.postRecord.findMany({
      where: {
        organizationId,
        platform: platform as Platform,
        status: "SUCCESS",
        postedAt: { gte: since },
      },
      select: { id: true, accountId: true, externalPostId: true },
      orderBy: { postedAt: "desc" },
      take: 20,
    });

    if (recentPosts.length < 2) {
      workflowLogger.info(`[distribution.crossEngage] Only ${recentPosts.length} recent posts — need 2+ for cross-engagement`);
      return { engagementsQueued: 0, reason: "Not enough recent posts" };
    }

    // For each post, find other accounts that should engage with it
    let engagementsQueued = 0;
    const accountIds = [...new Set(recentPosts.map((p) => p.accountId))];

    for (const post of recentPosts) {
      const otherAccounts = accountIds.filter((id) => id !== post.accountId);
      for (const otherAccountId of otherAccounts.slice(0, 3)) {
        // Queue engagement task via pg-boss with delay
        const { getBoss } = await import("@/lib/pg-boss");
        const boss = await getBoss();
        await boss.send(
          "engagement:cross-account",
          {
            organizationId,
            sourcePostId: post.id,
            sourceExternalId: post.externalPostId,
            engagingAccountId: otherAccountId,
            platform,
            action: "like",
          },
          {
            startAfter: new Date(Date.now() + delayMinutes * 60000),
            singletonKey: `cross:${post.id}:${otherAccountId}`,
            retryLimit: 2,
            expireInMinutes: 120,
          },
        );
        engagementsQueued++;
      }
    }

    workflowLogger.info(
      `[distribution.crossEngage] platform=${platform} engagementsQueued=${engagementsQueued} delay=${delayMinutes}min`,
    );

    return { engagementsQueued, platform, delayMinutes };
  });

  // ── distribution.pinComment ──────────────────────────────────
  // Pins an engagement-trigger comment on a recently published post.
  registerAction("distribution.pinComment", async (params, context) => {
    const organizationId = (params.organizationId as string) ?? context.organizationId;
    const postRecordId = params.postRecordId as string | undefined;
    const commentText = params.commentText as string;
    const platform = params.platform as string;

    if (!commentText) {
      return { pinned: false, reason: "No comment text provided" };
    }

    // If no specific post ID, find the most recent successful post
    let targetPost: { id: string; externalPostId: string | null } | null = null;

    if (postRecordId) {
      targetPost = await db.postRecord.findUnique({
        where: { id: postRecordId },
        select: { id: true, externalPostId: true },
      });
    } else {
      targetPost = await db.postRecord.findFirst({
        where: {
          organizationId,
          platform: platform as Platform,
          status: "SUCCESS",
          externalPostId: { not: null },
        },
        orderBy: { postedAt: "desc" },
        select: { id: true, externalPostId: true },
      });
    }

    if (!targetPost?.externalPostId) {
      workflowLogger.info(`[distribution.pinComment] No eligible post found for pinning`);
      return { pinned: false, reason: "No eligible post found" };
    }

    // Queue the pin-comment job
    const { getBoss } = await import("@/lib/pg-boss");
    const boss = await getBoss();
    await boss.send(
      "engagement:pin-comment",
      {
        organizationId,
        postRecordId: targetPost.id,
        externalPostId: targetPost.externalPostId,
        commentText,
        platform,
      },
      { retryLimit: 2, expireInMinutes: 60 },
    );

    workflowLogger.info(
      `[distribution.pinComment] Queued pin-comment for post ${targetPost.id} on ${platform}`,
    );

    return { pinned: true, postRecordId: targetPost.id, platform };
  });

  // ── analytics.collectHookMetrics ────────────────────────────────
  // Collects post metrics and updates hook performance scores
  // using Thompson Sampling feedback loop.
  registerAction("analytics.collectHookMetrics", async (params, context) => {
    const organizationId = (params.organizationId as string) ?? context.organizationId;
    const { collectMetrics } = await import("../services/hook-performance");

    const result = await collectMetrics(organizationId);

    workflowLogger.info(
      `[analytics.collectHookMetrics] org=${organizationId} posts=${result.postsProcessed} snapshots=${result.snapshotsCreated} hooks=${result.hooksUpdated}`,
    );

    return result;
  });

  // ── analytics.updatePostMetrics ───────────────────────────────
  // Updates a specific post's metrics from platform API data.
  registerAction("analytics.updatePostMetrics", async (params) => {
    const postRecordId = params.postRecordId as string;
    const metrics = params.metrics as {
      views: number;
      likes: number;
      comments: number;
      shares?: number;
      saves?: number;
      retentionRate?: number;
    };

    if (!postRecordId || !metrics) {
      return { updated: false, reason: "Missing postRecordId or metrics" };
    }

    const { updatePostMetrics } = await import("../services/hook-performance");
    await updatePostMetrics(postRecordId, metrics);

    workflowLogger.info(
      `[analytics.updatePostMetrics] post=${postRecordId} views=${metrics.views} engagement=${metrics.likes + metrics.comments}`,
    );

    return { updated: true, postRecordId };
  });

  workflowLogger.info("[workflow-actions] Registered 11 workflow action handlers");
}
