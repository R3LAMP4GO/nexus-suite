/**
 * Platform-specific browser upload logic.
 * Each platform fn takes a Patchright page, a temp video path, and caption,
 * then drives the upload UI and returns a PostResult.
 */

import type { Page } from "patchright";
import type { Platform } from "@prisma/client";

interface PostResult {
  success: boolean;
  externalPostId?: string;
  errorMessage?: string;
}

// ── Platform dispatch ────────────────────────────────────────────

export async function uploadViaPlatform(
  page: Page,
  platform: Platform,
  videoPath: string,
  caption: string | null,
): Promise<PostResult> {
  switch (platform) {
    case "TIKTOK":
      return uploadTikTok(page, videoPath, caption);
    case "INSTAGRAM":
      return uploadInstagram(page, videoPath, caption);
    case "YOUTUBE":
      return uploadYouTube(page, videoPath, caption);
    case "X":
      return uploadX(page, videoPath, caption);
    case "FACEBOOK":
      return uploadFacebook(page, videoPath, caption);
    case "LINKEDIN":
      return uploadLinkedIn(page, videoPath, caption);
    default:
      return { success: false, errorMessage: `Unsupported platform: ${platform}` };
  }
}

// ── TikTok Upload ────────────────────────────────────────────────

async function uploadTikTok(
  page: Page,
  videoPath: string,
  caption: string | null,
): Promise<PostResult> {
  await page.goto("https://www.tiktok.com/creator#/upload?lang=en", {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  // Wait for the file input and attach the video
  const fileInput = page.locator('input[type="file"][accept="video/*"]');
  await fileInput.waitFor({ state: "attached", timeout: 15_000 });
  await fileInput.setInputFiles(videoPath);

  // Wait for upload progress to complete — the post button becomes enabled
  const postButton = page.locator('[data-e2e="post-button"], button:has-text("Post")');
  await postButton.waitFor({ state: "visible", timeout: 60_000 });

  // Fill caption if provided
  if (caption) {
    const captionEditor = page.locator(
      '[data-e2e="caption-editor"] [contenteditable="true"], div[contenteditable="true"].public-DraftEditor-content',
    );
    await captionEditor.waitFor({ state: "visible", timeout: 10_000 });
    // Clear existing text and type human-like
    await captionEditor.click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Backspace");
    await captionEditor.type(caption, { delay: 35 });
  }

  // Click post
  await postButton.click();

  // Wait for success indicator
  try {
    await page.waitForSelector(
      '[data-e2e="upload-success"], :text("Your video is being uploaded")',
      { timeout: 60_000 },
    );
  } catch {
    // Check for error state
    const errorEl = page.locator('[data-e2e="upload-error"], :text("Failed")');
    if (await errorEl.isVisible()) {
      const errorText = await errorEl.textContent();
      return { success: false, errorMessage: `TikTok upload failed: ${errorText}` };
    }
    return { success: false, errorMessage: "TikTok upload timed out waiting for confirmation" };
  }

  // Try to extract external post ID from redirect URL
  let externalPostId: string | undefined;
  const url = page.url();
  const idMatch = url.match(/video\/(\d+)/);
  if (idMatch) {
    externalPostId = idMatch[1];
  }

  return { success: true, externalPostId };
}

// ── Instagram Upload ────────────────────────────────────────────

async function uploadInstagram(
  page: Page,
  videoPath: string,
  caption: string | null,
): Promise<PostResult> {
  // Navigate to Instagram and open create-post modal
  await page.goto("https://www.instagram.com/", {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  // Click the "New post" button (side nav SVG or top-bar +)
  const createButton = page.locator(
    'svg[aria-label="New post"], a[href="/create/style/"]',
  );
  await createButton.first().waitFor({ state: "visible", timeout: 15_000 });
  await createButton.first().click();

  // Attach file via hidden input in the modal
  const fileInput = page.locator('input[type="file"][accept*="video"]');
  await fileInput.waitFor({ state: "attached", timeout: 15_000 });
  await fileInput.setInputFiles(videoPath);

  // Click Next through crop/filter screens
  const nextButton = page.locator('button:has-text("Next"), div[role="button"]:has-text("Next")');
  await nextButton.first().waitFor({ state: "visible", timeout: 15_000 });
  await nextButton.first().click();
  await page.waitForTimeout(1500);

  // Second "Next" (filter → caption screen)
  await nextButton.first().waitFor({ state: "visible", timeout: 10_000 });
  await nextButton.first().click();
  await page.waitForTimeout(1500);

  // Fill caption
  if (caption) {
    const captionArea = page.locator(
      'textarea[aria-label="Write a caption..."], div[aria-label="Write a caption..."][contenteditable="true"]',
    );
    await captionArea.waitFor({ state: "visible", timeout: 10_000 });
    await captionArea.click();
    await captionArea.type(caption, { delay: 35 });
  }

  // Click Share
  const shareButton = page.locator('button:has-text("Share"), div[role="button"]:has-text("Share")');
  await shareButton.first().click();

  // Wait for success
  try {
    await page.waitForSelector(
      ':text("Your reel has been shared"), :text("Post shared"), img[alt="Animated checkmark"]',
      { timeout: 60_000 },
    );
  } catch {
    return { success: false, errorMessage: "Instagram upload timed out waiting for confirmation" };
  }

  return { success: true };
}

// ── YouTube Upload ──────────────────────────────────────────────

async function uploadYouTube(
  page: Page,
  videoPath: string,
  caption: string | null,
): Promise<PostResult> {
  await page.goto("https://studio.youtube.com/", {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  // Click the "Create" / upload button
  const createButton = page.locator('#create-icon, button[aria-label="Upload videos"]');
  await createButton.first().waitFor({ state: "visible", timeout: 15_000 });
  await createButton.first().click();

  // Click "Upload videos" from dropdown
  const uploadOption = page.locator('#text-item-0, tp-yt-paper-item:has-text("Upload videos")');
  await uploadOption.first().waitFor({ state: "visible", timeout: 10_000 });
  await uploadOption.first().click();

  // Attach file
  const fileInput = page.locator('input[type="file"][accept="video/*"]');
  await fileInput.waitFor({ state: "attached", timeout: 15_000 });
  await fileInput.setInputFiles(videoPath);

  // Fill title (replaces default filename)
  if (caption) {
    const titleInput = page.locator(
      '#textbox[aria-label="Add a title that describes your video (type @ to mention a channel)"], #title-textarea #textbox',
    );
    await titleInput.waitFor({ state: "visible", timeout: 15_000 });
    await titleInput.click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Backspace");
    await titleInput.type(caption, { delay: 30 });
  }

  // Select "No, it's not made for kids"
  const notForKids = page.locator('tp-yt-paper-radio-button[name="NOT_MADE_FOR_KIDS"]');
  if (await notForKids.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await notForKids.click();
  }

  // Click Next through Details → Video elements → Checks
  const nextBtn = page.locator('#next-button');
  for (let i = 0; i < 3; i++) {
    await nextBtn.waitFor({ state: "visible", timeout: 10_000 });
    await nextBtn.click();
    await page.waitForTimeout(1500);
  }

  // Select Public visibility
  const publicRadio = page.locator('tp-yt-paper-radio-button[name="PUBLIC"]');
  if (await publicRadio.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await publicRadio.click();
  }

  // Click Publish / Done
  const publishButton = page.locator('#done-button');
  await publishButton.waitFor({ state: "visible", timeout: 10_000 });
  await publishButton.click();

  // Wait for processing confirmation
  try {
    await page.waitForSelector(
      ':text("Video published"), a[href*="/video/"]',
      { timeout: 120_000 },
    );
  } catch {
    return { success: false, errorMessage: "YouTube upload timed out waiting for confirmation" };
  }

  // Extract video ID from success dialog link
  let externalPostId: string | undefined;
  const videoLink = page.locator('a[href*="youtu.be/"], a[href*="/video/"]');
  if (await videoLink.isVisible().catch(() => false)) {
    const href = await videoLink.getAttribute("href");
    const idMatch = href?.match(/(?:youtu\.be\/|\/video\/)([a-zA-Z0-9_-]+)/);
    if (idMatch) externalPostId = idMatch[1];
  }

  return { success: true, externalPostId };
}

// ── X (Twitter) Upload ──────────────────────────────────────────

async function uploadX(
  page: Page,
  videoPath: string,
  caption: string | null,
): Promise<PostResult> {
  await page.goto("https://x.com/compose/post", {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  // Attach media via hidden file input
  const fileInput = page.locator('input[type="file"][accept*="video"]');
  await fileInput.waitFor({ state: "attached", timeout: 15_000 });
  await fileInput.setInputFiles(videoPath);

  // Wait for video processing indicator to appear then disappear
  await page.waitForTimeout(2000);

  // Fill caption
  if (caption) {
    const tweetBox = page.locator(
      'div[data-testid="tweetTextarea_0"][contenteditable="true"], div[role="textbox"][data-testid="tweetTextarea_0"]',
    );
    await tweetBox.waitFor({ state: "visible", timeout: 10_000 });
    await tweetBox.click();
    await tweetBox.type(caption, { delay: 30 });
  }

  // Click Post button
  const postButton = page.locator('button[data-testid="tweetButton"]');
  await postButton.waitFor({ state: "visible", timeout: 60_000 });
  await postButton.click();

  // Wait for the compose modal to close (indicates success)
  try {
    await page.waitForSelector('div[data-testid="tweetTextarea_0"]', {
      state: "hidden",
      timeout: 60_000,
    });
  } catch {
    return { success: false, errorMessage: "X post timed out waiting for confirmation" };
  }

  return { success: true };
}

// ── Facebook Upload ─────────────────────────────────────────────

async function uploadFacebook(
  page: Page,
  videoPath: string,
  caption: string | null,
): Promise<PostResult> {
  // Navigate to page's video publishing tools (requires page context)
  await page.goto("https://www.facebook.com/", {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  // Click "What's on your mind?" to open post composer
  const createPost = page.locator(
    'div[role="button"]:has-text("What\'s on your mind"), span:has-text("What\'s on your mind")',
  );
  await createPost.first().waitFor({ state: "visible", timeout: 15_000 });
  await createPost.first().click();
  await page.waitForTimeout(1500);

  // Click "Photo/video" to enable media upload
  const photoVideoButton = page.locator(
    'div[role="button"]:has-text("Photo/video"), span:has-text("Photo/video")',
  );
  if (await photoVideoButton.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await photoVideoButton.first().click();
    await page.waitForTimeout(1000);
  }

  // Attach file
  const fileInput = page.locator('input[type="file"][accept*="video"]');
  await fileInput.waitFor({ state: "attached", timeout: 15_000 });
  await fileInput.setInputFiles(videoPath);

  // Fill caption
  if (caption) {
    const captionBox = page.locator(
      'div[contenteditable="true"][role="textbox"][aria-label*="on your mind"]',
    );
    await captionBox.waitFor({ state: "visible", timeout: 10_000 });
    await captionBox.click();
    await captionBox.type(caption, { delay: 35 });
  }

  // Click Post
  const postButton = page.locator(
    'div[role="button"][aria-label="Post"], span:has-text("Post")',
  );
  await postButton.first().waitFor({ state: "visible", timeout: 60_000 });
  await postButton.first().click();

  // Wait for composer to close
  try {
    await page.waitForSelector('div[role="dialog"]:has-text("Create post")', {
      state: "hidden",
      timeout: 60_000,
    });
  } catch {
    return { success: false, errorMessage: "Facebook post timed out waiting for confirmation" };
  }

  return { success: true };
}

// ── LinkedIn Upload ─────────────────────────────────────────────

async function uploadLinkedIn(
  page: Page,
  videoPath: string,
  caption: string | null,
): Promise<PostResult> {
  await page.goto("https://www.linkedin.com/feed/", {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  // Click "Start a post" button
  const startPost = page.locator(
    'button:has-text("Start a post"), button.share-box-feed-entry__trigger',
  );
  await startPost.first().waitFor({ state: "visible", timeout: 15_000 });
  await startPost.first().click();
  await page.waitForTimeout(1500);

  // Click media/video icon in the share modal
  const mediaButton = page.locator(
    'button[aria-label="Add media"], button:has-text("Media")',
  );
  if (await mediaButton.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await mediaButton.first().click();
    await page.waitForTimeout(1000);
  }

  // Attach file
  const fileInput = page.locator('input[type="file"][accept*="video"]');
  await fileInput.waitFor({ state: "attached", timeout: 15_000 });
  await fileInput.setInputFiles(videoPath);

  // Wait for video processing
  await page.waitForTimeout(3000);

  // Fill caption
  if (caption) {
    const captionBox = page.locator(
      'div[contenteditable="true"][role="textbox"].ql-editor, div[data-placeholder="What do you want to talk about?"]',
    );
    await captionBox.waitFor({ state: "visible", timeout: 10_000 });
    await captionBox.click();
    await captionBox.type(caption, { delay: 35 });
  }

  // Click Post
  const postButton = page.locator(
    'button.share-actions__primary-action:has-text("Post"), button[aria-label="Post"]',
  );
  await postButton.first().waitFor({ state: "visible", timeout: 60_000 });
  await postButton.first().click();

  // Wait for modal to close
  try {
    await page.waitForSelector('div[role="dialog"]:has-text("Create a post")', {
      state: "hidden",
      timeout: 60_000,
    });
  } catch {
    return { success: false, errorMessage: "LinkedIn post timed out waiting for confirmation" };
  }

  return { success: true };
}
