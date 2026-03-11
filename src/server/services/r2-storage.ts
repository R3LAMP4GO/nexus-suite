import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";

const accountId = process.env.R2_ACCOUNT_ID ?? "";
const bucket = process.env.R2_BUCKET_NAME ?? "nexus-storage";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

// Key prefix conventions:
// videos/{orgId}/
// sessions/{orgId}/{accountId}/
// thumbnails/{orgId}/
// profiles/{orgId}/

export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`;
}

export async function downloadFile(key: string): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const stream = res.Body;
  if (!stream) throw new Error(`Empty response for key: ${key}`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function getSignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  return awsGetSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  );
}

// ── Extended helpers ────────────────────────────────────────────

/** Upload a readable stream (for large files like videos). */
export async function uploadStream(
  key: string,
  stream: Readable,
  contentType: string,
): Promise<string> {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: stream,
      ContentType: contentType,
    },
    queueSize: 4,
    partSize: 10 * 1024 * 1024, // 10 MB parts
  });
  await upload.done();
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`;
}

/** Check if a key exists. Returns metadata if found, null otherwise. */
export async function fileExists(
  key: string,
): Promise<{ contentLength: number; contentType: string | undefined } | null> {
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      contentLength: head.ContentLength ?? 0,
      contentType: head.ContentType,
    };
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "name" in err &&
      (err.name === "NotFound" || err.name === "NoSuchKey")
    ) {
      return null;
    }
    throw err;
  }
}

/** List files under a prefix. Returns keys and sizes. */
export async function listFiles(
  prefix: string,
  maxKeys = 1000,
): Promise<{ key: string; size: number; lastModified: Date | undefined }[]> {
  const result = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    }),
  );
  return (result.Contents ?? []).map((obj) => ({
    key: obj.Key!,
    size: obj.Size ?? 0,
    lastModified: obj.LastModified,
  }));
}

/** Copy a file within the bucket (e.g. for video variation snapshots). */
export async function copyFile(
  sourceKey: string,
  destinationKey: string,
): Promise<void> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${sourceKey}`,
      Key: destinationKey,
    }),
  );
}

/** Delete all files under a prefix (e.g. cleanup org data). */
export async function deletePrefix(prefix: string): Promise<number> {
  let deleted = 0;
  let continuationToken: string | undefined;

  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of result.Contents ?? []) {
      if (obj.Key) {
        await deleteFile(obj.Key);
        deleted++;
      }
    }

    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}

/** Generate an upload signed URL for direct client-side uploads. */
export async function getUploadSignedUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  return awsGetSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}
