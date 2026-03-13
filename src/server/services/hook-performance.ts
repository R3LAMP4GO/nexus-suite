/**
 * Hook Performance Tracking Service
 *
 * Closes the feedback loop between hook generation and actual post performance.
 * Uses Thompson Sampling (Beta-Bernoulli bandit) to score hooks based on
 * real engagement data, so the hook-writer can learn which styles work best.
 *
 * Flow:
 * 1. collectMetrics() — Polls recent SUCCESS posts, snapshots metrics, traces back to hook
 * 2. updateHookScores() — Updates HookPerformance records with Thompson Sampling
 * 3. sampleTopHooks() — Returns hooks ranked by Thompson-sampled score for the hook-writer
 */

import { db } from "@/lib/db";
import type { Platform } from "@/generated/prisma/client";

// ── Thompson Sampling ────────────────────────────────────────────

/**
 * Sample from Beta(alpha, beta) distribution.
 * Uses the Joehnk method for generating beta-distributed random variates.
 */
function sampleBeta(alpha: number, beta: number): number {
  // Fast approximation via gamma sampling
  const gammaA = gammaVariate(alpha);
  const gammaB = gammaVariate(beta);
  return gammaA / (gammaA + gammaB);
}

/**
 * Generate gamma-distributed random variate using Marsaglia & Tsang's method.
 */
function gammaVariate(shape: number): number {
  if (shape < 1) {
    return gammaVariate(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number;
    let v: number;
    do {
      x = normalVariate();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normalVariate(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ── Engagement threshold for "success" in Thompson Sampling ──────

const ENGAGEMENT_THRESHOLD = 0.03; // 3% engagement rate = success

// ── Core Functions ───────────────────────────────────────────────

/**
 * Collect metrics for recent SUCCESS posts and create PostMetricSnapshots.
 * Traces each post back to its hook via: PostRecord → VideoVariation → SourceVideo → Script → hookText.
 *
 * Called by the analytics-feedback workflow on a schedule.
 */
export async function collectMetrics(organizationId: string): Promise<{
  postsProcessed: number;
  snapshotsCreated: number;
  hooksUpdated: number;
}> {
  // Find SUCCESS posts from the last 48 hours that haven't been snapshotted recently
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recentThreshold = new Date(Date.now() - 4 * 60 * 60 * 1000); // Don't re-snapshot within 4hr

  const posts = await db.postRecord.findMany({
    where: {
      organizationId,
      status: "SUCCESS",
      postedAt: { gte: since },
      externalPostId: { not: null },
    },
    select: {
      id: true,
      platform: true,
      externalPostId: true,
      postedAt: true,
      variation: {
        select: {
          sourceVideo: {
            select: {
              script: {
                select: { hookText: true },
              },
            },
          },
        },
      },
      metricSnapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 1,
        select: { snapshotAt: true },
      },
    },
  });

  let snapshotsCreated = 0;
  const hookUpdates = new Map<string, {
    hookText: string;
    platform: Platform;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
  }>();

  for (const post of posts) {
    // Skip if already snapshotted recently
    const lastSnapshot = post.metricSnapshots[0];
    if (lastSnapshot && lastSnapshot.snapshotAt > recentThreshold) continue;

    // In production, this would call the platform API to fetch real metrics.
    // For now, we create a snapshot with whatever data we can derive.
    // The platform API integration will fill in real numbers when available.
    const snapshot = await db.postMetricSnapshot.create({
      data: {
        postRecordId: post.id,
        views: 0,       // Populated by platform API polling
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        engagementRate: 0,
        retentionRate: null,
      },
    });
    snapshotsCreated++;

    // Trace back to hook text
    const hookText = post.variation?.sourceVideo?.script?.hookText;
    if (hookText) {
      const key = `${hookText}:${post.platform}`;
      if (!hookUpdates.has(key)) {
        hookUpdates.set(key, {
          hookText,
          platform: post.platform,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          engagementRate: 0,
        });
      }
    }
  }

  // Update hook performance records from latest metric snapshots
  let hooksUpdated = 0;
  for (const [, data] of hookUpdates) {
    await upsertHookPerformance(organizationId, data.hookText, data.platform);
    hooksUpdated++;
  }

  return {
    postsProcessed: posts.length,
    snapshotsCreated,
    hooksUpdated,
  };
}

/**
 * Update a PostMetricSnapshot with real metrics from platform API polling.
 * Called by platform-specific metric collectors.
 */
export async function updatePostMetrics(
  postRecordId: string,
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares?: number;
    saves?: number;
    retentionRate?: number;
  },
): Promise<void> {
  const engagementRate = metrics.views > 0
    ? (metrics.likes + metrics.comments + (metrics.shares ?? 0)) / metrics.views
    : 0;

  await db.postMetricSnapshot.create({
    data: {
      postRecordId,
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares ?? 0,
      saves: metrics.saves ?? 0,
      engagementRate: Math.round(engagementRate * 10000) / 10000,
      retentionRate: metrics.retentionRate ?? null,
    },
  });

  // Trace back to hook and update Thompson Sampling priors
  const post = await db.postRecord.findUnique({
    where: { id: postRecordId },
    select: {
      organizationId: true,
      platform: true,
      variation: {
        select: {
          sourceVideo: {
            select: { script: { select: { hookText: true } } },
          },
        },
      },
    },
  });

  const hookText = post?.variation?.sourceVideo?.script?.hookText;
  if (hookText && post) {
    await upsertHookPerformance(post.organizationId, hookText, post.platform, {
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares ?? 0,
      engagementRate,
      retentionRate: metrics.retentionRate,
    });
  }
}

/**
 * Upsert HookPerformance record and update Thompson Sampling priors.
 */
async function upsertHookPerformance(
  organizationId: string,
  hookText: string,
  platform: Platform,
  metrics?: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
    retentionRate?: number;
  },
): Promise<void> {
  const existing = await db.hookPerformance.findUnique({
    where: {
      organizationId_hookText_platform: {
        organizationId,
        hookText,
        platform,
      },
    },
  });

  if (!existing) {
    // Create new record
    const isSuccess = metrics ? metrics.engagementRate >= ENGAGEMENT_THRESHOLD : false;
    await db.hookPerformance.create({
      data: {
        organizationId,
        hookText,
        platform,
        timesUsed: 1,
        totalViews: metrics?.views ?? 0,
        totalLikes: metrics?.likes ?? 0,
        totalComments: metrics?.comments ?? 0,
        totalShares: metrics?.shares ?? 0,
        avgEngagement: metrics?.engagementRate ?? 0,
        avgRetention: metrics?.retentionRate ?? null,
        score: 0.5,
        alphaPrior: isSuccess ? 2 : 1,
        betaPrior: isSuccess ? 1 : 2,
      },
    });
    return;
  }

  if (!metrics) return;

  // Update running averages and Thompson priors
  const newTimesUsed = existing.timesUsed + 1;
  const newTotalViews = existing.totalViews + metrics.views;
  const newTotalLikes = existing.totalLikes + metrics.likes;
  const newTotalComments = existing.totalComments + metrics.comments;
  const newTotalShares = existing.totalShares + metrics.shares;
  const newAvgEngagement = newTotalViews > 0
    ? (newTotalLikes + newTotalComments + newTotalShares) / newTotalViews
    : 0;

  // Thompson Sampling update: success = engagement above threshold
  const isSuccess = metrics.engagementRate >= ENGAGEMENT_THRESHOLD;
  const newAlpha = existing.alphaPrior + (isSuccess ? 1 : 0);
  const newBeta = existing.betaPrior + (isSuccess ? 0 : 1);

  // Sample new score from updated posterior
  const newScore = sampleBeta(newAlpha, newBeta);

  await db.hookPerformance.update({
    where: { id: existing.id },
    data: {
      timesUsed: newTimesUsed,
      totalViews: newTotalViews,
      totalLikes: newTotalLikes,
      totalComments: newTotalComments,
      totalShares: newTotalShares,
      avgEngagement: Math.round(newAvgEngagement * 10000) / 10000,
      avgRetention: metrics.retentionRate ?? existing.avgRetention,
      score: Math.round(newScore * 10000) / 10000,
      alphaPrior: newAlpha,
      betaPrior: newBeta,
      lastUsedAt: new Date(),
    },
  });
}

/**
 * Sample top-performing hooks using Thompson Sampling.
 * Returns hooks ranked by sampled score — exploits winners while
 * exploring under-tested hooks (exploration-exploitation tradeoff).
 */
export async function sampleTopHooks(
  organizationId: string,
  platform?: string,
  limit = 10,
): Promise<Array<{
  hookText: string;
  hookFramework: string | null;
  platform: string;
  score: number;
  sampledScore: number;
  timesUsed: number;
  avgEngagement: number;
  avgRetention: number | null;
  confidence: string;
}>> {
  const where: Record<string, unknown> = { organizationId };
  if (platform) where.platform = platform;

  const hooks = await db.hookPerformance.findMany({
    where: where as any,
    orderBy: { score: "desc" },
    take: 50, // Get top 50, then re-rank by Thompson sample
  });

  // Re-rank by Thompson sampling (sample from each hook's posterior)
  const sampled = hooks.map((h) => ({
    hookText: h.hookText,
    hookFramework: h.hookFramework,
    platform: h.platform,
    score: h.score,
    sampledScore: sampleBeta(h.alphaPrior, h.betaPrior),
    timesUsed: h.timesUsed,
    avgEngagement: h.avgEngagement,
    avgRetention: h.avgRetention,
    confidence: h.timesUsed >= 10 ? "high" : h.timesUsed >= 3 ? "medium" : "low",
  }));

  // Sort by sampled score (stochastic — different each call for exploration)
  sampled.sort((a, b) => b.sampledScore - a.sampledScore);

  return sampled.slice(0, limit);
}

/**
 * Get aggregated hook performance stats by framework type.
 * Useful for understanding which hook styles work best on each platform.
 */
export async function getFrameworkStats(
  organizationId: string,
  platform?: string,
): Promise<Array<{
  framework: string;
  count: number;
  avgEngagement: number;
  avgScore: number;
  totalViews: number;
}>> {
  const where: Record<string, unknown> = {
    organizationId,
    hookFramework: { not: null },
  };
  if (platform) where.platform = platform;

  const grouped = await db.hookPerformance.groupBy({
    by: ["hookFramework"],
    where: where as any,
    _count: { id: true },
    _avg: { avgEngagement: true, score: true },
    _sum: { totalViews: true },
  });

  return grouped.map((g) => ({
    framework: g.hookFramework!,
    count: g._count.id,
    avgEngagement: Math.round((g._avg.avgEngagement ?? 0) * 10000) / 10000,
    avgScore: Math.round((g._avg.score ?? 0) * 10000) / 10000,
    totalViews: g._sum.totalViews ?? 0,
  }));
}
