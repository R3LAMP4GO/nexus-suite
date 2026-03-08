import { downloadFile } from "../r2-storage";
import type { PostResult, VariationData } from "../posting";

const TIKTOK_PUBLISH_URL =
  "https://open.tiktokapis.com/v2/post/publish/video/init/";

export async function postTikTokApi(
  accessToken: string,
  variation: VariationData,
): Promise<PostResult> {
  if (!variation.r2StorageKey) {
    return { success: false, errorMessage: "No r2StorageKey on variation" };
  }

  const buffer = await downloadFile(variation.r2StorageKey);

  // Step 1: Init publish with FILE_UPLOAD source
  const initRes = await fetch(TIKTOK_PUBLISH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: variation.caption?.slice(0, 150) ?? "",
        privacy_level: "SELF_ONLY",
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: buffer.length,
      },
    }),
  });

  if (!initRes.ok) {
    const body = await initRes.text();
    return {
      success: false,
      errorMessage: `TikTok init failed (${initRes.status}): ${body}`,
    };
  }

  const initData = (await initRes.json()) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { code?: string; message?: string };
  };

  if (initData.error?.code && initData.error.code !== "ok") {
    return {
      success: false,
      errorMessage: `TikTok error: ${initData.error.message ?? initData.error.code}`,
    };
  }

  const uploadUrl = initData.data?.upload_url;
  const publishId = initData.data?.publish_id;

  if (!uploadUrl || !publishId) {
    return {
      success: false,
      errorMessage: "TikTok did not return upload_url or publish_id",
    };
  }

  // Step 2: Upload video buffer to the provided URL
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(buffer.length),
    },
    body: new Uint8Array(buffer),
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    return {
      success: false,
      errorMessage: `TikTok upload failed (${uploadRes.status}): ${body}`,
    };
  }

  return { success: true, externalPostId: publishId };
}
