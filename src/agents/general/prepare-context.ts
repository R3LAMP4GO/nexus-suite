import type { RawAgentContext, PreparedContext } from "./types";

/**
 * Allowed fields per agent — only these keys survive stripping.
 * Agents not listed here get only organizationId + userPrompt.
 */
const AGENT_ALLOWED_FIELDS: Record<string, readonly string[]> = {
  "nexus-orchestrator": ["organizationId", "userPrompt"],
  "workflow-agent": ["organizationId", "userPrompt", "contentDraft"],
  "youtube-agent": ["organizationId", "userPrompt", "platformData", "brandVoice", "contentDraft", "analytics"],
  "tiktok-agent": ["organizationId", "userPrompt", "platformData", "brandVoice", "contentDraft"],
  "instagram-agent": ["organizationId", "userPrompt", "platformData", "brandVoice", "contentDraft", "mediaAssets"],
  "linkedin-agent": ["organizationId", "userPrompt", "platformData", "brandVoice", "contentDraft"],
  "x-agent": ["organizationId", "userPrompt", "platformData", "brandVoice", "contentDraft"],
  "facebook-agent": ["organizationId", "userPrompt", "platformData", "brandVoice", "contentDraft", "mediaAssets"],
  "seo-agent": ["organizationId", "userPrompt", "analytics"],
  "hook-writer": ["organizationId", "userPrompt", "platformData"],
  "title-generator": ["organizationId", "userPrompt", "analytics"],
  "thumbnail-creator": ["organizationId", "userPrompt", "mediaAssets"],
  "script-agent": ["organizationId", "userPrompt", "brandVoice", "contentDraft"],
  "caption-writer": ["organizationId", "userPrompt", "brandVoice", "platformData"],
  "hashtag-optimizer": ["organizationId", "userPrompt", "analytics", "platformData"],
  "thread-writer": ["organizationId", "userPrompt", "brandVoice", "contentDraft"],
  "article-writer": ["organizationId", "userPrompt", "brandVoice", "analytics"],
  "trend-scout": ["organizationId", "userPrompt", "platformData"],
  "engagement-responder": ["organizationId", "userPrompt", "platformData"],
  "analytics-reporter": ["organizationId", "userPrompt", "analytics"],
  "content-repurposer": ["organizationId", "userPrompt", "contentDraft", "platformData", "mediaAssets"],
  "quality-scorer": ["organizationId", "userPrompt", "contentDraft"],
  "variation-orchestrator": ["organizationId", "userPrompt", "mediaAssets"],
  "brand-persona-agent": ["organizationId", "userPrompt", "brandVoice"],
  "viral-teardown-agent": ["organizationId", "userPrompt", "contentDraft", "analytics"],
};

const BASE_FIELDS: readonly string[] = ["organizationId", "userPrompt"];

/**
 * Strip raw context to only fields the named agent needs.
 * Enforces data minimization: agents never see data they don't require.
 */
export function prepareContext(
  agentName: string,
  raw: RawAgentContext,
): PreparedContext {
  const allowed = AGENT_ALLOWED_FIELDS[agentName] ?? BASE_FIELDS;

  const prepared: PreparedContext = {
    organizationId: raw.organizationId,
    userPrompt: raw.userPrompt,
  };

  for (const field of allowed) {
    if (field in raw && raw[field] !== undefined) {
      prepared[field] = raw[field];
    }
  }

  return prepared;
}
