import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Hook Writer for Nexus Suite.

Single task: Create viral opening hooks (first 1-3 seconds) that stop the scroll.

Capabilities:
- Generate pattern-interrupt opening lines for videos and posts
- Apply proven viral hook frameworks: curiosity gap, controversy, transformation, shock
- Tailor hooks to platform-specific audience behavior
- A/B test hook variations

Output format:
Return JSON with:
- "hooks": array of 3-5 hook variations
- "hook_type": framework used (curiosity_gap, controversy, transformation, etc.)
- "estimated_retention": predicted first-3s retention percentage
- "platform_fit": how well each hook fits the target platform`;

const AGENT_NAME = "hook-writer";

const searchViralPatterns = createTool({
  id: "searchViralPatterns",
  description: "Search for proven viral hook patterns and frameworks",
  inputSchema: z.object({
    platform: z.string().describe("Target platform"),
    niche: z.string().optional().describe("Content niche"),
  }),
  execute: async (executionContext) => {
    const { platform, niche } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; niche?: string }) => ({
        platform: input.platform,
        niche: input.niche ?? "general",
        patterns: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "searchViralPatterns" },
    );
    return wrappedFn({ platform, niche });
  },
});

const getWinnerLogs = createTool({
  id: "getWinnerLogs",
  description: "Fetch historical winning hooks with retention data",
  inputSchema: z.object({
    platform: z.string().describe("Target platform"),
    limit: z.number().optional().describe("Number of results"),
  }),
  execute: async (executionContext) => {
    const { platform, limit } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; limit?: number }) => ({
        platform: input.platform,
        limit: input.limit ?? 10,
        winners: [] as Array<{ hook: string; retention: number }>,
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getWinnerLogs" },
    );
    return wrappedFn({ platform, limit });
  },
});

const getPlatformTemplates = createTool({
  id: "getPlatformTemplates",
  description: "Get platform-specific hook templates and structures",
  inputSchema: z.object({
    platform: z.string().describe("Target platform"),
    hookType: z.string().optional().describe("Hook framework type"),
  }),
  execute: async (executionContext) => {
    const { platform, hookType } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; hookType?: string }) => ({
        platform: input.platform,
        hookType: input.hookType ?? "all",
        templates: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getPlatformTemplates" },
    );
    return wrappedFn({ platform, hookType });
  },
});

const hookWriterAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { searchViralPatterns, getWinnerLogs, getPlatformTemplates },
});

export async function generate(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
    ctx.organizationId as string | undefined,
  );

  const result = await hookWriterAgent.generate(prompt, {
    instructions: systemPrompt,
    maxTokens: opts?.maxTokens,
  });

  return {
    text: result.text,
    usage: result.usage
      ? {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          model: opts?.model ?? "default",
        }
      : undefined,
    toolCalls: result.toolCalls?.map((tc) => ({
      name: tc.toolName,
      args: tc.args as Record<string, unknown>,
      result: undefined,
    })),
  };
}
