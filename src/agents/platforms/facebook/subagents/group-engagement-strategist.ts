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
  execute: async (input) => {
    const { groupType, topic, goal } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { groupType: string; topic: string; goal?: string }) => {
        const goal = input.goal ?? "discussion";
        const isOwned = input.groupType === "owned";

        const FORMATS: Record<string, { postFormat: string; structure: string; engagementTriggers: string[] }> = {
          discussion: {
            postFormat: isOwned ? "question-post" : "value-comment",
            structure: isOwned
              ? "Open question → Context (1-2 sentences) → Tag prompt ('Drop your experience below 👇')"
              : "Thoughtful answer to existing question → Personal insight → Subtle expertise signal",
            engagementTriggers: isOwned
              ? ["Ask 'This or That' questions", "Use polls for binary choices", "Tag active members by name", "Pin best answers"]
              : ["Reply to others before posting", "Reference OP's specific point", "Share data/results, not opinions", "Ask follow-up questions"],
          },
          leads: {
            postFormat: isOwned ? "case-study" : "resource-share",
            structure: isOwned
              ? "Result headline → Before/After story → 3 key lessons → Soft CTA ('DM me for the template')"
              : "Helpful resource link → Why it's relevant → Brief personal take → No CTA (let people come to you)",
            engagementTriggers: isOwned
              ? ["Share member success stories", "Run weekly challenges", "Offer exclusive free resources", "Host live Q&A"]
              : ["Lead with genuine value", "Never post links in first comment", "Build trust over 2-3 weeks before any CTA"],
          },
          authority: {
            postFormat: isOwned ? "educational-series" : "expert-take",
            structure: isOwned
              ? "Weekly series name → Numbered lesson → Key takeaway → Discussion question"
              : "Contrarian or nuanced take on hot topic → Evidence → Invite debate respectfully",
            engagementTriggers: isOwned
              ? ["Create recurring content themes", "Use 'Save this post' CTAs", "Cross-reference previous posts"]
              : ["Respond to every reply on your posts", "Acknowledge opposing views", "Share original data/research"],
          },
          community: {
            postFormat: isOwned ? "community-spotlight" : "appreciation-post",
            structure: isOwned
              ? "Member spotlight → Their achievement → Celebration prompt → Welcome new members"
              : "Thank the group/admin → Share what you've learned → Invite others to share",
            engagementTriggers: isOwned
              ? ["Celebrate milestones", "Welcome posts for new members", "Monthly recaps", "Member of the week"]
              : ["Be consistently helpful", "Remember regular posters by name", "Offer to help newcomers"],
          },
        };

        const format = FORMATS[goal] ?? FORMATS.discussion;

        return {
          groupType: input.groupType,
          topic: input.topic,
          goal,
          postFormat: format.postFormat,
          structure: format.structure,
          engagementTriggers: format.engagementTriggers,
          timing: isOwned
            ? "Post between 9-11am local time for maximum visibility. Avoid weekends unless community is hobby-based."
            : "Post when the group is most active — check recent post timestamps. Respond within 30 min of posting.",
          algorithmTips: [
            "Posts with 5+ comments in first hour get boosted",
            "Image posts get 2.3x more engagement than text-only",
            "Questions in the first line increase comment rate by 50%",
            isOwned ? "Pin your best-performing posts weekly" : "Never self-promote in your first 5 posts",
          ],
        };
      },
      { agentName: "group-engagement-strategist", toolName: "planGroupContent" },
    );
    return wrappedFn({ groupType, topic, goal });
  },
});

export const groupEngagementStrategistAgent = new Agent({
  id: "group-engagement-strategist",
  name: "Group Engagement Strategist",
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
