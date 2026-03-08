import { downloadFile } from "../r2-storage";
import type { PostResult, VariationData } from "../posting";

const YOUTUBE_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable";

export async function postYouTubeApi(
  accessToken: string,
  variation: VariationData,
): Promise<PostResult> {
  if (!variation.r2StorageKey) {
    return { success: false, errorMessage: "No r2StorageKey on variation" };
  }

  const buffer = await downloadFile(variation.r2StorageKey);

  // Step 1: Initiate resumable upload — get upload URI
  const initRes = await fetch(YOUTUBE_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/*",
      "X-Upload-Content-Length": String(buffer.length),
    },
    body: JSON.stringify({
      snippet: {
        title: variation.caption?.slice(0, 100) ?? "Untitled",
        description: variation.caption ?? "",
      },
      status: {
        privacyStatus: "public",
      },
    }),
  });

  if (!initRes.ok) {
    const body = await initRes.text();
    return {
      success: false,
      errorMessage: `YouTube init failed (${initRes.status}): ${body}`,
    };
  }

  const uploadUri = initRes.headers.get("location");
  if (!uploadUri) {
    return { success: false, errorMessage: "YouTube did not return upload URI" };
  }

  // Step 2: Upload video buffer to resumable URI
  const uploadRes = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      "Content-Type": "video/*",
      "Content-Length": String(buffer.length),
    },
    body: new Uint8Array(buffer),
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    return {
      success: false,
      errorMessage: `YouTube upload failed (${uploadRes.status}): ${body}`,
    };
  }

  const data = (await uploadRes.json()) as { id?: string };

  if (!data.id) {
    return { success: false, errorMessage: "YouTube response missing video id" };
  }

  return { success: true, externalPostId: data.id };
}
