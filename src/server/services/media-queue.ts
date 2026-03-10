import type PgBoss from "pg-boss";
import { getBoss } from "@/lib/pg-boss";

// ── Types (mirror consumer's MediaJob) ───────────────────────────

export interface MediaJob {
  type: "download" | "transform";
  organizationId: string;
  sourceUrl?: string;
  localPath?: string;
  outputKey?: string;
  transforms?: Record<string, unknown>;
}

// ── Sender ───────────────────────────────────────────────────────

const QUEUE_NAME = "media:task";

export async function sendMediaJob(
  payload: MediaJob,
  options?: PgBoss.SendOptions,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUE_NAME, payload, options ?? {});
}
