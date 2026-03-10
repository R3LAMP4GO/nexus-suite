// Facebook sub-agent: Group Engagement Strategist — Tier 2.5
// Plans content and engagement strategies for Facebook Groups.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";

const planGroupContent = createTool({
  id: "planGroupContent",
  description: "Plan a content piece optimized for Facebook Group engagement",
  inputSchema: z.object({
    groupType: z.enum(["owned", "external"]).describe("Whether the brand owns the group or is posting externally"),
    topic: z.string().describe("Topic or theme for the post"),
    goal: z.enum(["discussion", "leads", "authority", "community"]).optional().describe("Primary goal"),
  }),
  execute: async (executionContext) => {
    const { groupType, topic, goal } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { groupType: string; topic: string; goal?: string }) => ({
        groupType: input.groupType,
        topic: input.topic,
        goal: input.goal ?? "discussion",
        postFormat: "",
        engagementTriggers: [] as string[],
        status: "pending-integration" as const,
      }),
      { agentName: "group-engagement-strategist", toolName: "planGroupContent" },
    );
    return wrappedFn({ groupType, topic, goal });
  },
});

export const groupEngagementStrategistAgent = new Agent({
  name: "group-engagement-strategist",
  instructions: `You are a Group Engagement Strategist sub-agent for the Facebook platform.

Your job is to plan content specifically for Facebook Groups:

For OWNED groups:
- Welcome posts for new members with engagement prompts
- Weekly themed discussions (e.g. "Win Wednesday", "Feedback Friday")
- Polls and questions to boost activity
- Exclusive content that rewards membership
- Pinned posts with group rules and resources

For EXTERNAL groups:
- Value-first posts — never lead with promotion
- Answer questions with genuine expertise
- Share relevant case studies or insights
- Build authority through consistent helpful contributions
- Subtle CTAs only after establishing trust

Facebook Group algorithm signals:
- "Meaningful interactions" — comments and replies rank highest
- Posts with questions get 2-3x more comments
- Image/video posts outperform text-only
- Admin-endorsed posts get boosted visibility

Return structured output with post format, copy, engagement triggers, and timing recommendation.`,
  model: modelConfig.tier25,
  tools: { planGroupContent },
});
