import type { BrowserContext } from "patchright";
import type { BypassResult } from "./plain-http.js";

const RECAPTCHA_TIMEOUT = 45_000;

// Z.ai / Zhipu AI GLM endpoint — OpenAI-compatible
const ZHIPU_API_BASE =
  process.env.ZHIPU_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4";
const ZHIPU_VISION_MODEL = process.env.ZHIPU_VISION_MODEL ?? "glm-4v-plus";

/**
 * reCAPTCHA v2 solver — vision-first approach via GLM-4V.
 * 1. Click reCAPTCHA checkbox
 * 2. If challenge appears, screenshot it
 * 3. Send screenshot to GLM-4V for grid position identification
 * 4. Click identified tiles and verify
 * Falls back to audio challenge if vision fails.
 */
export async function solveRecaptcha(
  url: string,
  context: BrowserContext,
): Promise<BypassResult> {
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });

    // Find reCAPTCHA iframe and click checkbox
    const recaptchaFrame = await page.waitForSelector(
      'iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/enterprise/anchor"]',
      { timeout: 10_000 },
    );

    if (!recaptchaFrame) {
      throw new Error("reCAPTCHA iframe not found");
    }

    const anchorFrame = await recaptchaFrame.contentFrame();
    if (!anchorFrame) throw new Error("Cannot access reCAPTCHA anchor frame");

    // Click the checkbox
    const checkbox = await anchorFrame.waitForSelector(
      "#recaptcha-anchor",
      { timeout: 5_000 },
    );
    if (checkbox) await checkbox.click();

    // Wait for challenge frame to appear
    await page.waitForTimeout(2_000);

    // Find the bframe (challenge frame)
    const bframeHandle = await page.waitForSelector(
      'iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha/enterprise/bframe"]',
      { timeout: 10_000 },
    );

    if (!bframeHandle) {
      // Maybe already solved by just clicking checkbox
      return await extractResult(url, page, context);
    }

    const bframe = await bframeHandle.contentFrame();
    if (!bframe) throw new Error("Cannot access reCAPTCHA challenge frame");

    // Vision-first: screenshot the challenge and solve with GLM-4V
    const visionResult = await solveWithVision(bframe, page, url, context);
    if (visionResult) return visionResult;

    // Fallback: audio challenge approach
    const audioResult = await solveWithAudio(bframe, page, url, context);
    if (audioResult) return audioResult;

    throw new Error("reCAPTCHA solve failed: both vision and audio approaches exhausted");
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Vision solver — screenshots the CAPTCHA challenge and uses GLM-4V
 * to identify which grid tiles to select.
 *
 * GLM-4V excels at precise visual grounding: it can reason about objects
 * in images step-by-step and identify bounding boxes / grid positions.
 */
async function solveWithVision(
  bframe: import("patchright").Frame,
  page: import("patchright").Page,
  url: string,
  context: BrowserContext,
): Promise<BypassResult | null> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    console.warn("[reCAPTCHA] no ZHIPU_API_KEY set, skipping vision solve");
    return null;
  }

  try {
    // Screenshot the captcha challenge area
    const frameElement = await bframe.frameElement();
    const screenshot = await frameElement.screenshot({ type: "png" });
    const base64Image = Buffer.from(screenshot).toString("base64");

    const resp = await fetch(`${ZHIPU_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ZHIPU_VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "You are solving a reCAPTCHA image grid challenge.",
                  "Look at the image carefully. Identify what object the challenge asks you to select.",
                  "The grid is numbered 1-9 (3x3) or 1-16 (4x4), left-to-right, top-to-bottom.",
                  "Think step by step: first identify the target object, then examine each tile.",
                  "Reply with ONLY the matching tile numbers as comma-separated integers. Example: 1,4,7",
                ].join(" "),
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${base64Image}` },
              },
            ],
          },
        ],
        max_tokens: 100,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!resp.ok) {
      console.warn(`[reCAPTCHA] GLM-4V API error: ${resp.status} ${resp.statusText}`);
      return null;
    }

    const data = await resp.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const answer = data.choices?.[0]?.message?.content;
    if (!answer) return null;

    // Parse grid positions from the response
    const positions = answer.match(/\d+/g)?.map(Number).filter((n) => n >= 1 && n <= 16);
    if (!positions?.length) return null;

    // Click each tile in the grid
    const tiles = await bframe.$$("td.rc-imageselect-tile");
    for (const pos of positions) {
      const tile = tiles[pos - 1];
      if (tile) await tile.click();
      await page.waitForTimeout(300);
    }

    const verifyBtn = await bframe.$("#recaptcha-verify-button");
    if (verifyBtn) await verifyBtn.click();
    await page.waitForTimeout(3_000);

    return await extractResult(url, page, context);
  } catch (err) {
    console.warn("[reCAPTCHA] vision solve failed:", err);
    return null;
  }
}

/**
 * Audio solver fallback — clicks audio challenge, downloads MP3,
 * uses GLM-4V to describe what's spoken in the audio context.
 * Since GLM doesn't have a dedicated whisper endpoint, we describe
 * the audio challenge scenario and attempt the text input.
 */
async function solveWithAudio(
  bframe: import("patchright").Frame,
  page: import("patchright").Page,
  url: string,
  context: BrowserContext,
): Promise<BypassResult | null> {
  try {
    const audioButton = await bframe
      .waitForSelector("#recaptcha-audio-button", { timeout: 5_000 })
      .catch(() => null);

    if (!audioButton) return null;

    await audioButton.click();
    await page.waitForTimeout(1_000);

    // Get the audio source URL
    const audioSrc = await bframe.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>("#audio-source");
      return audio?.src ?? null;
    });

    if (!audioSrc) return null;

    const transcript = await transcribeAudioWithGlm(audioSrc);
    if (!transcript) return null;

    // Type the transcript into the response field
    const responseInput = await bframe.waitForSelector(
      "#audio-response",
      { timeout: 5_000 },
    );
    if (!responseInput) return null;

    await responseInput.fill(transcript);
    const verifyBtn = await bframe.waitForSelector(
      "#recaptcha-verify-button",
      { timeout: 3_000 },
    );
    if (verifyBtn) await verifyBtn.click();
    await page.waitForTimeout(3_000);

    return await extractResult(url, page, context);
  } catch (err) {
    console.warn("[reCAPTCHA] audio solve failed:", err);
    return null;
  }
}

/**
 * Transcribe reCAPTCHA audio using GLM text model.
 * Downloads the MP3 audio, base64-encodes it, and sends to GLM
 * with instructions to transcribe the spoken digits/words.
 */
async function transcribeAudioWithGlm(audioUrl: string): Promise<string | null> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    console.warn("[reCAPTCHA] no ZHIPU_API_KEY set, skipping audio transcription");
    return null;
  }

  try {
    // Download the audio file
    const audioResp = await fetch(audioUrl);
    const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
    const base64Audio = audioBuffer.toString("base64");

    // Use GLM-4V with audio description — the model can process audio context
    const resp = await fetch(`${ZHIPU_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ZHIPU_VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "This is a reCAPTCHA audio challenge. The audio contains spoken digits or words.",
                  "Listen carefully and transcribe exactly what is said.",
                  "Reply with ONLY the transcribed text, nothing else.",
                ].join(" "),
              },
              {
                type: "image_url",
                image_url: { url: `data:audio/mp3;base64,${base64Audio}` },
              },
            ],
          },
        ],
        max_tokens: 50,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    return text?.trim() || null;
  } catch (err) {
    console.warn("[reCAPTCHA] audio transcription failed:", err);
    return null;
  }
}

async function extractResult(
  url: string,
  page: import("patchright").Page,
  context: BrowserContext,
): Promise<BypassResult> {
  const html = await page.content();
  const browserCookies = await context.cookies(url);
  const cookies = browserCookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
  }));

  return {
    success: true,
    html,
    cookies,
    strategy: "recaptcha",
  };
}
