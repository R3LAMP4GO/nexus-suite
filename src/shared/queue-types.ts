/**
 * Canonical queue payload types shared between the main app and microservices.
 *
 * Main-app code imports directly from this file.
 * Microservices (media-engine, scraper-pool) cannot import from `src/` —
 * they duplicate the types locally with a "Keep in sync" comment pointing here.
 */

import type { TransformConfig, TransformFragment } from "@/server/services/media-types";

// ── Media job payloads ──────────────────────────────────────────

export interface MediaJobPayload {
  type: "download" | "transform" | "audio-check";
  organizationId: string;
  sourceUrl?: string;
  localPath?: string;
  outputKey?: string;
  transforms?: TransformConfig | TransformFragment;
}

export interface MediaJobResult {
  success: boolean;
  r2Key?: string;
  error?: string;
  audioAnalysis?: { copyrightRisk: boolean; confidence: number };
  audioStripped?: boolean;
}

// ── Scrape payloads (re-export from canonical location) ─────────

export type {
  ScrapeTask,
  ScrapeResult,
  ScrapeCookie,
} from "@/server/services/scrape-types";
