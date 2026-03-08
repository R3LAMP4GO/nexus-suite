import crypto from "node:crypto";
import { downloadFile } from "../r2-storage";
import { isMockMode, mockPostResult } from "./meta";
import type { PostResult, VariationData } from "../posting";

const MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";
const TWEETS_URL = "https://api.x.com/2/tweets";
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const STATUS_POLL_INTERVAL_MS = 5_000;
const STATUS_POLL_MAX_ATTEMPTS = 60;

// ── OAuth 1.0a Signing ───────────────────────────────────────

interface OAuthCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function buildOAuthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  creds: OAuthCredentials,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  // Combine oauth params + request params for signature base
  const allParams = { ...oauthParams, ...params };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k]!)}`)
    .join("&");

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  oauthParams["oauth_signature"] = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k]!)}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

// ── Chunked Media Upload ─────────────────────────────────────

async function mediaUploadInit(
  totalBytes: number,
  mediaType: string,
  creds: OAuthCredentials,
): Promise<{ mediaId: string } | { error: string }> {
  const params: Record<string, string> = {
    command: "INIT",
    total_bytes: String(totalBytes),
    media_type: mediaType,
  };

  const auth = buildOAuthHeader("POST", MEDIA_UPLOAD_URL, params, creds);
  const body = new URLSearchParams(params);

  const res = await fetch(MEDIA_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: `INIT failed (${res.status}): ${text}` };
  }

  const data = (await res.json()) as { media_id_string?: string };
  if (!data.media_id_string) return { error: "INIT response missing media_id_string" };
  return { mediaId: data.media_id_string };
}

async function mediaUploadAppend(
  mediaId: string,
  segmentIndex: number,
  chunk: Buffer,
  creds: OAuthCredentials,
): Promise<string | null> {
  // APPEND uses multipart — oauth params do NOT include body params for multipart
  const params: Record<string, string> = {
    command: "APPEND",
    media_id: mediaId,
    segment_index: String(segmentIndex),
  };

  const auth = buildOAuthHeader("POST", MEDIA_UPLOAD_URL, params, creds);

  const boundary = `----NexusBoundary${crypto.randomBytes(8).toString("hex")}`;
  const parts: Buffer[] = [];

  for (const [key, val] of Object.entries(params)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`,
      ),
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="media_data"; filename="chunk.mp4"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    chunk,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );

  const body = Buffer.concat(parts);

  const res = await fetch(MEDIA_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: new Uint8Array(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return `APPEND segment ${segmentIndex} failed (${res.status}): ${text}`;
  }

  return null; // success — no error
}

async function mediaUploadFinalize(
  mediaId: string,
  creds: OAuthCredentials,
): Promise<{ processingInfo?: { state: string } } | { error: string }> {
  const params: Record<string, string> = { command: "FINALIZE", media_id: mediaId };
  const auth = buildOAuthHeader("POST", MEDIA_UPLOAD_URL, params, creds);

  const res = await fetch(MEDIA_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: `FINALIZE failed (${res.status}): ${text}` };
  }

  const data = (await res.json()) as {
    processing_info?: { state: string; check_after_secs?: number };
  };
  return { processingInfo: data.processing_info };
}

async function mediaUploadStatus(
  mediaId: string,
  creds: OAuthCredentials,
): Promise<{ state: string; error?: string }> {
  const params: Record<string, string> = { command: "STATUS", media_id: mediaId };
  const auth = buildOAuthHeader("GET", MEDIA_UPLOAD_URL, params, creds);
  const qs = new URLSearchParams(params).toString();

  const res = await fetch(`${MEDIA_UPLOAD_URL}?${qs}`, {
    method: "GET",
    headers: { Authorization: auth },
  });

  if (!res.ok) {
    const text = await res.text();
    return { state: "failed", error: `STATUS check failed (${res.status}): ${text}` };
  }

  const data = (await res.json()) as {
    processing_info?: { state: string; error?: { message: string } };
  };

  if (!data.processing_info) return { state: "succeeded" };
  if (data.processing_info.error) {
    return { state: "failed", error: data.processing_info.error.message };
  }
  return { state: data.processing_info.state };
}

// ── Main Export ──────────────────────────────────────────────

export async function postXApi(
  accessToken: string,
  variation: VariationData,
): Promise<PostResult> {
  if (isMockMode()) return mockPostResult();

  if (!variation.r2StorageKey) {
    return { success: false, errorMessage: "No r2StorageKey on variation" };
  }

  const buffer = await downloadFile(variation.r2StorageKey);

  // Build OAuth 1.0a credentials — accessToken here is the user oauth_token,
  // but media upload also needs api_key, api_secret, access_token_secret from env
  const creds: OAuthCredentials = {
    apiKey: process.env.X_API_KEY ?? "",
    apiSecret: process.env.X_API_SECRET ?? "",
    accessToken,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET ?? "",
  };

  // ── Step 1: INIT ──
  const initResult = await mediaUploadInit(buffer.length, "video/mp4", creds);
  if ("error" in initResult) {
    return { success: false, errorMessage: initResult.error };
  }
  const { mediaId } = initResult;

  // ── Step 2: APPEND (chunked) ──
  const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, buffer.length);
    const chunk = buffer.subarray(start, end);
    const err = await mediaUploadAppend(mediaId, i, chunk as Buffer, creds);
    if (err) return { success: false, errorMessage: err };
  }

  // ── Step 3: FINALIZE ──
  const finalizeResult = await mediaUploadFinalize(mediaId, creds);
  if ("error" in finalizeResult) {
    return { success: false, errorMessage: finalizeResult.error };
  }

  // ── Step 4: Poll STATUS until succeeded ──
  if (finalizeResult.processingInfo) {
    for (let i = 0; i < STATUS_POLL_MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, STATUS_POLL_INTERVAL_MS));
      const status = await mediaUploadStatus(mediaId, creds);
      if (status.state === "succeeded") break;
      if (status.state === "failed") {
        return { success: false, errorMessage: status.error ?? "Media processing failed" };
      }
      if (i === STATUS_POLL_MAX_ATTEMPTS - 1) {
        return { success: false, errorMessage: "Media processing timed out" };
      }
    }
  }

  // ── Step 5: Create tweet with media ──
  // POST /2/tweets requires OAuth 1.0a User Context (not Bearer token)
  const tweetAuth = buildOAuthHeader("POST", TWEETS_URL, {}, creds);
  const tweetRes = await fetch(TWEETS_URL, {
    method: "POST",
    headers: {
      Authorization: tweetAuth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: variation.caption ?? "",
      media: { media_ids: [mediaId] },
    }),
  });

  if (!tweetRes.ok) {
    const body = await tweetRes.text();
    return { success: false, errorMessage: `Tweet creation failed (${tweetRes.status}): ${body}` };
  }

  const tweetData = (await tweetRes.json()) as { data?: { id?: string } };
  const tweetId = tweetData.data?.id;
  if (!tweetId) {
    return { success: false, errorMessage: "Tweet response missing id" };
  }

  return { success: true, externalPostId: tweetId };
}
