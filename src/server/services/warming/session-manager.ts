import { fetchSecret } from "../../../lib/infisical";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { uploadFile, downloadFile } from "@/server/services/r2-storage";

const INFISICAL_PROJECT_ID = process.env.INFISICAL_PROJECT_ID!;
const INFISICAL_ENV = process.env.INFISICAL_ENV ?? "dev";

// ── Encryption helpers (AES-256-GCM) ───────────────────────────

async function getEncryptionKey(orgId: string): Promise<Buffer> {
  const keyHex = await fetchSecret(
    INFISICAL_PROJECT_ID,
    INFISICAL_ENV,
    `/orgs/${orgId}/warming`,
    "sessionEncryptionKey",
  );
  return Buffer.from(keyHex, "hex");
}

function encrypt(data: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [12 iv][16 tag][...ciphertext]
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(blob: Buffer, key: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── Public API ─────────────────────────────────────────────────

export interface SessionState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  localStorage?: Record<string, string>;
}

/**
 * Save browser session state → encrypt → upload to R2.
 * Path: sessions/{orgId}/{accountId}/state.json
 */
export async function saveSessionState(
  orgId: string,
  accountId: string,
  state: SessionState,
): Promise<string> {
  const key = await getEncryptionKey(orgId);
  const plaintext = Buffer.from(JSON.stringify(state), "utf-8");
  const encrypted = encrypt(plaintext, key);

  const r2Key = `sessions/${orgId}/${accountId}/state.json`;
  await uploadFile(r2Key, encrypted, "application/octet-stream");
  return r2Key;
}

/**
 * Download from R2 → decrypt → return session state.
 * Returns null if no session exists yet.
 */
export async function loadSessionState(
  orgId: string,
  accountId: string,
): Promise<SessionState | null> {
  const r2Key = `sessions/${orgId}/${accountId}/state.json`;

  try {
    const body = await downloadFile(r2Key);

    const key = await getEncryptionKey(orgId);
    const decrypted = decrypt(body, key);
    return JSON.parse(decrypted.toString("utf-8")) as SessionState;
  } catch (err: unknown) {
    // NoSuchKey / Empty response = first run, no session yet
    if (
      err instanceof Error &&
      (err.name === "NoSuchKey" || err.name === "NotFound" || err.message.startsWith("Empty response"))
    ) {
      return null;
    }
    throw err;
  }
}
