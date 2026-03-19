// Orchestrator Agent — Tier 1
// Receives top-level tasks, identifies target platform, delegates to Platform Main Agents.
// Validates the full delegation chain: Orchestrator → Platform Main → Sub-agent/Specialist.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { executeAgentDelegate, getWorkflowContext } from "@/server/workflows/agent-delegate";
import type { WorkflowContext } from "@/server/workflows/control-flow";
import { modelConfig } from "@/agents/platforms/model-config";

const PLATFORM_AGENTS: Record<string, string> = {
  youtube: "youtube-main",
  tiktok: "tiktok-main",
  instagram: "instagram-main",
  linkedin: "linkedin-main",
  x: "x-main",
  facebook: "facebook-agent",
};

const delegateToPlatform = createTool({
  id: "delegateToPlatform",
  description:
    "Delegate a task to a platform-specific main agent (youtube-main, tiktok-main, instagram-main, linkedin-main, x-main)",
  inputSchema: z.object({
    platform: z.enum(["youtube", "tiktok", "instagram", "linkedin", "x", "facebook"]).describe("Target platform"),
    prompt: z.string().describe("Task prompt for the platform agent"),
  }),
  execute: async (input) => {
    const { platform, prompt } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; prompt: string }) => {
        const agentName = PLATFORM_AGENTS[input.platform];
        if (!agentName) {
          return { error: `Unknown platform: ${input.platform}`, status: "error" as const };
        }
        const workflowContext = getWorkflowContext();
        const result = await executeAgentDelegate(agentName, input.prompt, workflowContext);
        return {
          delegatedTo: agentName,
          platform: input.platform,
          result,
          status: "delegated" as const,
        };
      },
      { agentName: "orchestrator", toolName: "delegateToPlatform" },
    );
    return wrappedFn({ platform, prompt });
  },
});

const delegateToSpecialist = createTool({
  id: "delegateToSpecialist",
  description:
    "Delegate a task to a shared Tier 3 specialist agent (trend-scout, seo-agent, hook-writer, etc.)",
  inputSchema: z.object({
    specialistName: z.string().describe("Name of the specialist agent"),
    prompt: z.string().describe("Task prompt for the specialist"),
  }),
  execute: async (input) => {
    const { specialistName, prompt } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { specialistName: string; prompt: string }) => {
        const workflowContext = getWorkflowContext();
        const result = await executeAgentDelegate(input.specialistName, input.prompt, workflowContext);
        return {
          delegatedTo: input.specialistName,
          result,
          status: "delegated" as const,
        };
      },
      { agentName: "orchestrator", toolName: "delegateToSpecialist" },
    );
    return wrappedFn({ specialistName, prompt });
  },
});

export const orchestratorAgent = new Agent({
  id: "orchestrator",
  name: "orchestrator",
  instructions: `You are the Orchestrator — the top-level coordinator for all content creation tasks.

Your responsibilities:
1. Analyze the incoming task and identify the target platform(s)
2. Delegate to the appropriate Platform Main Agent (Tier 2)
3. For cross-platform or shared tasks, delegate to Tier 3 specialists directly
4. Aggregate results and return a unified response

Platform agents: youtube-main, tiktok-main, instagram-main, linkedin-main, x-main
Specialists: trend-scout, seo-agent, hook-writer, title-generator, caption-writer, hashtag-optimizer, quality-scorer

Always delegate — never generate platform-specific content directly.`,
  model: modelConfig.tier1,
  tools: { delegateToPlatform, delegateToSpecialist },
});

/**
 * Execute the orchestrator with context preparation and delegation.
 * Entry point for the full chain: Orchestrator → Platform Main → Sub-agent/Specialist.
 */
export async function executeOrchestrator(
  prompt: string,
  context: WorkflowContext,
): Promise<unknown> {
  return executeAgentDelegate("orchestrator", prompt, context);
}
