// ── Shared Prompt Templates ──────────────────────────────────────

import { loadBrandStrategy } from "../my_approach/loader";

/**
 * Build a complete system prompt by combining org brand voice with agent-specific instructions.
 * If brandVoice is not passed explicitly, attempts to load from my_approach/{orgId}/.
 */
export function buildSystemPrompt(
  agentInstructions: string,
  brandVoice?: string,
  orgId?: string,
): string {
  const parts: string[] = [];

  // Try loading from my_approach if no explicit brand voice and orgId is available
  let resolvedBrandVoice = brandVoice;
  let toneExamples: string | null = null;

  if (!resolvedBrandVoice && orgId) {
    const strategy = loadBrandStrategy(orgId);
    resolvedBrandVoice = strategy.brandVoice ?? undefined;
    toneExamples = strategy.toneExamples;
  }

  if (resolvedBrandVoice) {
    parts.push(`## Brand Voice\n${resolvedBrandVoice}`);
  }

  if (toneExamples) {
    parts.push(`## Tone Examples\n${toneExamples}`);
  }

  parts.push(`## Instructions\n${agentInstructions}`);

  return parts.join("\n\n");
}
