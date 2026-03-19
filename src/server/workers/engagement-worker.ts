/**
 * Engagement worker — consumes `engagement:cross-account` and `engagement:pin-comment`
 * queues enqueued by workflow actions (distribution.crossEngage / distribution.pinComment).
 *
 * TODO: Platform-specific selectors need real implementation following the patterns
 * in src/server/services/browser-posting.ts
 */

import { db } from "@/lib/db";
import { getBoss } from "@/lib/pg-boss";
import { loadAccountContext, launchBrowser, persistSession } from "@/server/services/browser-helpers";

// ── Payload types ────────────────────────────────────────────

export interface CrossAccountEngagementPayload {
  organizationId: string;
  sourcePostId: string;
  sourceExternalId: string;
  engagingAccountId: string;
  platform: string;
  action: "like";
}

export interface PinCommentPayload {
  organizationId: string;
  postRecordId: string;
  externalPostId: string;
  commentText: string;
  platform: string;
}

// ── URL helpers ──────────────────────────────────────────────

function constructPostUrl(platform: string, externalPostId: string): string {
  switch (platform.toUpperCase()) {
    case "YOUTUBE":
      return `https://www.youtube.com/watch?v=${externalPostId}`;
    case "TIKTOK":
      return `https://www.tiktok.com/@_/video/${externalPostId}`;
    case "INSTAGRAM":
      return `https://www.instagram.com/reel/${externalPostId}/`;
    case "FACEBOOK":
      return `https://www.facebook.com/${externalPostId}`;
    case "LINKEDIN":
      return `https://www.linkedin.com/feed/update/${externalPostId}`;
    case "X":
      return `https://x.com/i/status/${externalPostId}`;
    default:
      return `https://example.com/post/${externalPostId}`;
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleCrossAccountEngagement(payload: CrossAccountEngagementPayload): Promise<void> {
  const { engagingAccountId, platform, sourceExternalId, sourcePostId, action } = payload;
  console.log(
    `[engagement-worker] cross-account: action=${action} post=${sourcePostId} account=${engagingAccountId} platform=${platform}`,
  );

  const ctx = await loadAccountContext(engagingAccountId);
  const { browser, context, page } = await launchBrowser(ctx);

  try {
    const postUrl = constructPostUrl(platform, sourceExternalId);
    await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // TODO: Platform-specific selectors need real implementation
    // following the patterns in src/server/services/browser-posting.ts
    console.log(
      `[engagement-worker] cross-account: navigated to ${postUrl}, performing "${action}" (stub)`,
    );

    await persistSession(context, ctx);
    console.log(
      `[engagement-worker] cross-account: completed action=${action} post=${sourcePostId} account=${engagingAccountId}`,
    );
  } finally {
    await browser.close();
  }
}

async function handlePinComment(payload: PinCommentPayload): Promise<void> {
  const { postRecordId, externalPostId, commentText, platform } = payload;
  console.log(
    `[engagement-worker] pin-comment: post=${postRecordId} platform=${platform}`,
  );

  // Load the posting account from the post record
  const postRecord = await db.postRecord.findUniqueOrThrow({
    where: { id: postRecordId },
    select: { accountId: true },
  });

  const ctx = await loadAccountContext(postRecord.accountId);
  const { browser, context, page } = await launchBrowser(ctx);

  try {
    const postUrl = constructPostUrl(platform, externalPostId);
    await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // TODO: Platform-specific selectors for adding and pinning comments need
    // real implementation following the patterns in src/server/services/browser-posting.ts
    console.log(
      `[engagement-worker] pin-comment: navigated to ${postUrl}, adding comment "${commentText.slice(0, 50)}..." and pinning (stub)`,
    );

    await persistSession(context, ctx);
    console.log(
      `[engagement-worker] pin-comment: completed post=${postRecordId}`,
    );
  } finally {
    await browser.close();
  }
}

// ── Lifecycle ────────────────────────────────────────────────

export async function startEngagementWorker(): Promise<void> {
  const boss = await getBoss();

  await boss.work<CrossAccountEngagementPayload>(
    "engagement:cross-account",
    { batchSize: 1 },
    async ([job]) => {
      await handleCrossAccountEngagement(job.data);
    },
  );

  await boss.work<PinCommentPayload>(
    "engagement:pin-comment",
    { batchSize: 1 },
    async ([job]) => {
      await handlePinComment(job.data);
    },
  );

  console.log("[engagement-worker] registered queues: engagement:cross-account, engagement:pin-comment");
}

export async function stopEngagementWorker(): Promise<void> {
  // No-op: pg-boss lifecycle is managed by the shared singleton in src/lib/pg-boss.ts
}
