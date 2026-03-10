// Loads brand-prompt.md from client plugin directories.
// Used by the workflow executor to inject brand voice into agent context.

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const CLIENTS_DIR = resolve(process.cwd(), "src", "agents", "clients");

// Cache brand prompts in memory (cleared on restart)
const brandPromptCache = new Map<string, string | null>();

/**
 * Load brand-prompt.md for an organization from its client plugin directory.
 * Returns the file contents as a string, or null if not found.
 * Results are cached in memory.
 */
export function loadBrandPrompt(organizationId: string): string | null {
  if (brandPromptCache.has(organizationId)) {
    return brandPromptCache.get(organizationId) ?? null;
  }

  const filePath = join(CLIENTS_DIR, organizationId, "brand-prompt.md");

  if (!existsSync(filePath)) {
    brandPromptCache.set(organizationId, null);
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    brandPromptCache.set(organizationId, content);
    return content;
  } catch {
    brandPromptCache.set(organizationId, null);
    return null;
  }
}

/** Clear cached brand prompts (useful after admin edits brand-prompt.md). */
export function clearBrandPromptCache(organizationId?: string): void {
  if (organizationId) {
    brandPromptCache.delete(organizationId);
  } else {
    brandPromptCache.clear();
  }
}
