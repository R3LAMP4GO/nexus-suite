import type { PgBoss } from "pg-boss";
import { db } from "@/lib/db";
import { getBoss } from "@/lib/pg-boss";

// ── Config ───────────────────────────────────────────────────

const CRON_NAME = "competitor:poll";
const CRON_SCHEDULE = "*/15 * * * *"; // every 15 min
const SCRAPLING_URL =
  process.env.SCRAPLING_URL ?? "http://scrapling-sidecar:8000";
const SCRAPLING_TIMEOUT = 60_000;

// ── Sidecar types ────────────────────────────────────────────

interface ScrapedPost {
  title?: string | null;
  url?: string | null;
  thumbnail?: string | null;
  views?: string | null;
  likes?: string | null;
  comments?: string | null;
  published_at?: string | null;
}

interface ScrapePostsResponse {
  posts: ScrapedPost[];
  count: number;
  tier_used: number;
}

// ── Helpers ──────────────────────────────────────────────────

function parseCount(value: string | null | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.kmb]/gi, "").toLowerCase();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  if (cleaned.endsWith("b")) return Math.round(num * 1_000_000_000);
  if (cleaned.endsWith("m")) return Math.round(num * 1_000_000);
  if (cleaned.endsWith("k")) return Math.round(num * 1_000);
  return Math.round(num);
}

function deriveExternalId(post: ScrapedPost, index: number): string {
  if (post.url) {
    // Extract last path segment or video ID as external ID
    const match = post.url.match(/\/([^/?#]+)(?:[?#]|$)/);
    if (match) return match[1];
  }
  return `unknown-${index}`;
}

// ── Worker ───────────────────────────────────────────────────

const TASK_QUEUE = "competitor:task";

// ── Outlier detection ────────────────────────────────────────

async function detectOutliers(
  boss: PgBoss,
  creatorId: string,
  organizationId: string,
  outlierThreshold: number,
  autoReproduce: boolean,
  postIds: string[],
): Promise<void> {
  if (postIds.length === 0) return;

  // Batch-fetch all snapshots for all posts in one query
  const allSnapshots = await db.postSnapshot.findMany({
    where: { postId: { in: postIds } },
    orderBy: { capturedAt: "asc" },
    select: { postId: true, views: true },
  });

  // Group snapshots by postId
  const snapshotsByPost = new Map<string, number[]>();
  for (const s of allSnapshots) {
    let arr = snapshotsByPost.get(s.postId);
    if (!arr) {
      arr = [];
      snapshotsByPost.set(s.postId, arr);
    }
    arr.push(s.views);
  }

  // Calculate outlier status for each post
  const outlierUpdates: { id: string; isOutlier: boolean; outlierScore: number | null }[] = [];
  const outlierPostIds: string[] = [];

  for (const postId of postIds) {
    const viewValues = snapshotsByPost.get(postId);
    if (!viewValues || viewValues.length < 3) {
      outlierUpdates.push({ id: postId, isOutlier: false, outlierScore: null });
      continue;
    }

    const mean = viewValues.reduce((a, b) => a + b, 0) / viewValues.length;
    const variance =
      viewValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
      viewValues.length;
    const stddev = Math.sqrt(variance);

    if (stddev === 0) {
      outlierUpdates.push({ id: postId, isOutlier: false, outlierScore: null });
      continue;
    }

    const currentViews = viewValues[viewValues.length - 1];
    const zScore = (currentViews - mean) / stddev;
    const isOutlier = zScore > outlierThreshold;

    outlierUpdates.push({
      id: postId,
      isOutlier,
      outlierScore: isOutlier ? zScore : null,
    });

    if (isOutlier) outlierPostIds.push(postId);
  }

  // Batch-update all outlier statuses
  await db.$transaction(
    outlierUpdates.map((u) =>
      db.trackedPost.update({
        where: { id: u.id },
        data: { isOutlier: u.isOutlier, outlierScore: u.outlierScore },
      }),
    ),
  );

  // Batch-fetch posts that need auto-reproduce check
  if (autoReproduce && outlierPostIds.length > 0) {
    const posts = await db.trackedPost.findMany({
      where: { id: { in: outlierPostIds } },
      select: { id: true, reproduced: true, url: true },
    });

    for (const post of posts) {
      if (!post.reproduced && post.url) {
        const update = outlierUpdates.find((u) => u.id === post.id);
        await boss.send(TASK_QUEUE, {
          jobType: "reproduce",
          postId: post.id,
          url: post.url,
          organizationId,
        });

        console.log(
          `[competitor-poll] outlier detected postId=${post.id} z=${update?.outlierScore?.toFixed(2)} — enqueued reproduce`,
        );
      }
    }
  }
}

// ── Poll single creator ─────────────────────────────────────

async function pollCreator(
  pgBoss: PgBoss,
  creator: {
    id: string;
    organizationId: string;
    profileUrl: string;
    platform: string;
    outlierThreshold: number;
    autoReproduce: boolean;
  },
): Promise<void> {
  const resp = await fetch(`${SCRAPLING_URL}/scrape/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: creator.profileUrl,
      platform: creator.platform.toLowerCase(),
    }),
    signal: AbortSignal.timeout(SCRAPLING_TIMEOUT),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error(
      `[competitor-poll] scrape failed for creator=${creator.id}: ${resp.status} ${body}`,
    );
    return;
  }

  const data = (await resp.json()) as ScrapePostsResponse;

  const upsertedPostIds: string[] = [];

  for (let i = 0; i < data.posts.length; i++) {
    const scraped = data.posts[i];
    const externalId = deriveExternalId(scraped, i);
    const views = parseCount(scraped.views);
    const likes = parseCount(scraped.likes);
    const comments = parseCount(scraped.comments);

    const post = await db.trackedPost.upsert({
      where: {
        creatorId_externalId: {
          creatorId: creator.id,
          externalId,
        },
      },
      create: {
        creatorId: creator.id,
        externalId,
        title: scraped.title ?? null,
        url: scraped.url ?? null,
        thumbnailUrl: scraped.thumbnail ?? null,
        views,
        likes,
        comments,
      },
      update: {
        title: scraped.title ?? undefined,
        url: scraped.url ?? undefined,
        thumbnailUrl: scraped.thumbnail ?? undefined,
        views,
        likes,
        comments,
      },
    });

    await db.postSnapshot.create({
      data: {
        postId: post.id,
        views,
        likes,
        comments,
      },
    });

    upsertedPostIds.push(post.id);
  }

  // Outlier detection + auto-reproduce trigger
  await detectOutliers(
    pgBoss,
    creator.id,
    creator.organizationId,
    creator.outlierThreshold,
    creator.autoReproduce,
    upsertedPostIds,
  );

  await db.trackedCreator.update({
    where: { id: creator.id },
    data: { lastPolledAt: new Date() },
  });

  console.log(
    `[competitor-poll] polled creator=${creator.id} posts=${data.posts.length}`,
  );
}

const POLL_BATCH_SIZE = 100;

async function handlePollCron(): Promise<void> {
  const now = new Date();
  const b = await getBoss();

  let cursor: string | undefined;
  let totalDue = 0;
  let totalFetched = 0;

  // Paginate through active creators in batches
  for (;;) {
    const batch = await db.trackedCreator.findMany({
      where: {
        isActive: true,
        OR: [
          { lastPolledAt: null },
          {
            lastPolledAt: {
              lt: new Date(now.getTime() - 1000), // placeholder, refined below
            },
          },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        profileUrl: true,
        platform: true,
        pollInterval: true,
        lastPolledAt: true,
        outlierThreshold: true,
        autoReproduce: true,
      },
      take: POLL_BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (batch.length === 0) break;

    totalFetched += batch.length;
    cursor = batch[batch.length - 1].id;

    // Filter by individual pollInterval
    const due = batch.filter((c) => {
      if (!c.lastPolledAt) return true;
      return c.lastPolledAt.getTime() + c.pollInterval * 1000 < now.getTime();
    });

    totalDue += due.length;

    for (const creator of due) {
      try {
        await pollCreator(b, creator);
      } catch (err) {
        console.error(`[competitor-poll] error polling creator=${creator.id}:`, err);
      }
    }

    if (batch.length < POLL_BATCH_SIZE) break;
  }

  console.log(
    `[competitor-poll] ${totalDue}/${totalFetched} creators due`,
  );
}

export async function startCompetitorPollingWorker(): Promise<void> {
  const b = await getBoss();

  await b.schedule(CRON_NAME, CRON_SCHEDULE, {}, { tz: "UTC" });

  await b.work(CRON_NAME, { batchSize: 1 }, async () => {
    await handlePollCron();
  });

  console.log("[competitor-poll] cron scheduled:", CRON_SCHEDULE);
}

export async function stopCompetitorPollingWorker(): Promise<void> {
  // Unschedule cron via shared boss — lifecycle managed by src/lib/pg-boss.ts
  const b = await getBoss();
  await b.unschedule(CRON_NAME);
}
