import type PgBoss from "pg-boss";
import { getBoss } from "@/lib/pg-boss";
import type { MediaJobPayload } from "@/shared/queue-types";

// Re-export so existing consumers keep working
export type MediaJob = MediaJobPayload;

// ── Sender ───────────────────────────────────────────────────────

const QUEUE_NAME = "media:task";

export async function sendMediaJob(
  payload: MediaJob,
  options?: PgBoss.SendOptions,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE_NAME, payload, options ?? {});
}
