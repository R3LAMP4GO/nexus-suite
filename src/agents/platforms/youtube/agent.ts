// YouTube Platform Main Agent — Tier 2

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { executeAgentDelegate, getWorkflowContext } from "@/server/workflows/agent-delegate";
import { modelConfig } from "@/agents/platforms/model-config";

const delegateToSubAgent = createTool({
  id: "delegateToSubAgent",
  description:
    "Delegate a task to a YouTube sub-agent by name (community-post-formatter, shorts-optimizer)",
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
      { agentName: "youtube-main", toolName: "delegateToSubAgent" },
    );
    return wrappedFn({ subAgentName, prompt });
  },
});

export const youtubeMainAgent = new Agent({
  id: "youtube-main",
  name: "youtube-main",
  instructions: `You are the YouTube Platform Main Agent. Your role is to handle all YouTube-related content tasks.

You can delegate to these sub-agents:
- community-post-formatter: Formats community tab posts (polls, updates, engagement posts)
- shorts-optimizer: Optimizes content for YouTube Shorts format (vertical, <60s, hook-first)

For specialist tasks (SEO, thumbnails, scripts, hooks), delegate to shared Tier 3 specialists via the orchestrator.

Prioritize watch time, CTR, and subscriber growth. Optimize titles and descriptions for YouTube search.`,
  model: modelConfig.tier2,
  tools: { delegateToSubAgent },
});
