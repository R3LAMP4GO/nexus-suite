// LinkedIn Platform Main Agent — Tier 2

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { executeAgentDelegate, getWorkflowContext } from "@/server/workflows/agent-delegate";
import { modelConfig } from "@/agents/platforms/model-config";

const delegateToSubAgent = createTool({
  id: "delegateToSubAgent",
  description:
    "Delegate a task to a LinkedIn sub-agent by name (professional-tone-adapter, article-formatter)",
  inputSchema: z.object({
    subAgentName: z.string().describe("Name of the sub-agent to delegate to"),
    prompt: z.string().describe("Task prompt for the sub-agent"),
  }),
  execute: async (input) => {
    const { subAgentName, prompt } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { subAgentName: string; prompt: string }) => {
        const workflowContext = getWorkflowContext();
        const result = await executeAgentDelegate(input.subAgentName, input.prompt, workflowContext);
        return {
          delegatedTo: input.subAgentName,
          result,
          status: "delegated" as const,
        };
      },
      { agentName: "linkedin-main", toolName: "delegateToSubAgent" },
    );
    return wrappedFn({ subAgentName, prompt });
  },
});

export const linkedinMainAgent = new Agent({
  id: "linkedin-main",
  name: "LinkedIn Main",
  instructions: `You are the LinkedIn Platform Main Agent. Your role is to handle all LinkedIn-related content tasks.

You can delegate to these sub-agents:
- professional-tone-adapter: Adapts content to LinkedIn's professional tone
- article-formatter: Formats long-form articles for LinkedIn's publishing platform

For specialist tasks (SEO, hooks, captions), delegate to shared Tier 3 specialists via the orchestrator.

Prioritize thought leadership, professional engagement, and network growth. Content should be insightful, not salesy.`,
  model: modelConfig.tier2,
  tools: { delegateToSubAgent },
});
