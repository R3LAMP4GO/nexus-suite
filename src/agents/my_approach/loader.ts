// Loads org-scoped brand strategy files from my_approach/{orgId}/
// Used by buildSystemPrompt() and workflow executor to inject brand context.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const MY_APPROACH_DIR = resolve(process.cwd(), "src/agents/my_approach");

export interface BrandStrategy {
  brandVoice: string | null;
  contentStrategy: ContentStrategyConfig | null;
  toneExamples: string | null;
}

export interface ContentStrategyConfig {
  platforms: string[];
  postingFrequency: Record<string, string>;
  contentPillars: string[];
  toneKeywords: string[];
  avoidTopics: string[];
  hashtagStrategy: string;
}

function readFileOrNull(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

/**
 * Load brand strategy for an organization.
 * Returns null fields for any missing files — agents work without brand data,
 * they just produce generic output.
 */
export function loadBrandStrategy(orgId: string): BrandStrategy {
  const orgDir = resolve(MY_APPROACH_DIR, orgId);

  const brandVoice = readFileOrNull(resolve(orgDir, "brand-voice.md"));
  const toneExamples = readFileOrNull(resolve(orgDir, "tone-examples.md"));

  const strategyRaw = readFileOrNull(resolve(orgDir, "content-strategy.json"));
  let contentStrategy: ContentStrategyConfig | null = null;
  if (strategyRaw) {
    try {
      contentStrategy = JSON.parse(strategyRaw) as ContentStrategyConfig;
    } catch {
      console.warn(`[my_approach] Invalid content-strategy.json for org ${orgId}`);
    }
  }

  return { brandVoice, contentStrategy, toneExamples };
}

/**
 * Check if an org has brand strategy configured.
 */
export function hasBrandStrategy(orgId: string): boolean {
  const orgDir = resolve(MY_APPROACH_DIR, orgId);
  return existsSync(resolve(orgDir, "brand-voice.md"));
}
