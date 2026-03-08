import type { ToolsInput } from "@mastra/core/agent";

/** Configuration for creating a Nexus agent */
export interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools: ToolsInput;
  model: string;
  maxTokens: number;
}

/** Tool set mapping for agent capabilities */
export type AgentToolSet = ToolsInput;

/** Fields that prepareContext can strip from raw input */
export interface RawAgentContext {
  organizationId: string;
  brandVoice?: string;
  platformData?: Record<string, unknown>;
  contentDraft?: string;
  analytics?: Record<string, unknown>;
  mediaAssets?: Array<{ url: string; type: string }>;
  userPrompt: string;
  [key: string]: unknown;
}

/** Minimized payload after prepareContext strips unnecessary fields */
export interface PreparedContext {
  organizationId: string;
  userPrompt: string;
  [key: string]: unknown;
}
