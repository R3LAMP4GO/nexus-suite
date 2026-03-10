// Centralized model configuration for all agents.
// Uses Zhipu AI (Z.ai) GLM models via the zhipu-ai-provider.
// GLM-4.6V for vision tasks, GLM-4.5 for text generation.

import { createZhipu } from "zhipu-ai-provider";
import type { LanguageModelV1 } from "ai";

// Z.ai provider — reads ZHIPU_API_KEY from env.
// Uses international endpoint by default; swap to bigmodel.cn for China.
const zhipu = createZhipu({
  baseURL: process.env.ZHIPU_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
  apiKey: process.env.ZHIPU_API_KEY,
});

export const modelConfig = {
  /** Tier 1 orchestrator + Tier 2 platform main agents — highest capability */
  tier1: zhipu("glm-4.5") as unknown as LanguageModelV1,
  /** Tier 2 platform main agents — high capability */
  tier2: zhipu("glm-4.5") as unknown as LanguageModelV1,
  /** Tier 2.5 sub-agents — cost-optimized */
  tier25: zhipu("glm-4.5-air") as unknown as LanguageModelV1,
  /** Vision tasks (CAPTCHA, image analysis) — GLM-4.6V */
  vision: zhipu("glm-4.6v") as unknown as LanguageModelV1,
};
