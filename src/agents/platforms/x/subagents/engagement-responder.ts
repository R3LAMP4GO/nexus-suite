// X sub-agent: Engagement Responder — Tier 2.5
// Crafts replies, quote tweets, and engagement responses for X.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";

const craftReply = createTool({
  id: "craftReply",
  description: "Craft a brand-voice reply to a tweet given the original tweet and context",
  inputSchema: z.object({
    originalTweet: z.string().describe("The tweet to reply to"),
    context: z.string().optional().describe("Additional context about the conversation or brand"),
    replyStyle: z.enum(["witty", "helpful", "insightful", "empathetic"]).optional().describe("Desired reply style"),
  }),
  execute: async (executionContext) => {
    const { originalTweet, context, replyStyle } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { originalTweet: string; context?: string; replyStyle?: string }) => {
        const style = input.replyStyle ?? "helpful";
        const tweetLength = input.originalTweet.length;

        // Analyze the original tweet for reply strategy
        const hasQuestion = /\?/.test(input.originalTweet);
        const isControversial = /unpopular opinion|hot take|controversial|disagree/i.test(input.originalTweet);
        const isCelebration = /congrats|amazing|just launched|shipped|milestone|excited/i.test(input.originalTweet);

        const STYLE_TEMPLATES: Record<string, { opener: string[]; structure: string; maxLength: number; emojiLevel: string }> = {
          witty: {
            opener: ["Plot twist:", "Not me reading this and...", "This is the tweet.", "Say it louder 📢"],
            structure: "Short punchy reaction (1-2 sentences) + clever observation",
            maxLength: 200,
            emojiLevel: "moderate (1-2 emojis)",
          },
          helpful: {
            opener: ["Great point —", "Adding to this:", "This is spot on.", "Here's what I'd add:"],
            structure: "Acknowledge their point + Add value (tip, resource, or experience) + Optional follow-up question",
            maxLength: 260,
            emojiLevel: "minimal (0-1 emojis)",
          },
          insightful: {
            opener: ["The nuance here is", "What most people miss:", "Underrated take.", "This connects to"],
            structure: "Reframe their point with deeper insight + Data or example + Thought-provoking closer",
            maxLength: 270,
            emojiLevel: "none",
          },
          empathetic: {
            opener: ["I felt this.", "Been there.", "This resonates.", "Appreciate you sharing this."],
            structure: "Validate their experience + Share brief related experience + Supportive closer",
            maxLength: 240,
            emojiLevel: "moderate (1-2 heart/support emojis)",
          },
        };

        const template = STYLE_TEMPLATES[style] ?? STYLE_TEMPLATES.helpful;

        return {
          originalTweet: input.originalTweet.slice(0, 200) + (tweetLength > 200 ? "..." : ""),
          context: input.context ?? "",
          replyStyle: style,
          replyGuidance: {
            suggestedOpeners: template.opener,
            structure: template.structure,
            maxLength: template.maxLength,
            emojiLevel: template.emojiLevel,
          },
          tweetAnalysis: {
            hasQuestion,
            isControversial,
            isCelebration,
            sentiment: isCelebration ? "positive" : isControversial ? "divisive" : hasQuestion ? "curious" : "neutral",
            replyPriority: hasQuestion ? "high" : isCelebration ? "medium" : "standard",
          },
          rules: [
            "Never start a reply with 'I' — it makes it about you, not them",
            "Quote their specific words when agreeing — shows you read carefully",
            "Keep under 280 chars — replies that are threads feel like lectures",
            isControversial ? "On controversial takes: agree with the nuance, not the extreme" : "",
            isCelebration ? "Celebration replies should be specific — 'congrats' alone is weak" : "",
            hasQuestion ? "Answer the question first, THEN add your take" : "",
          ].filter(Boolean),
        };
      },
      { agentName: "x-engagement-responder", toolName: "craftReply" },
    );
    return wrappedFn({ originalTweet, context, replyStyle });
  },
});

export const engagementResponderAgent = new Agent({
  name: "x-engagement-responder",
  instructions: `You are an Engagement Responder sub-agent for the X (Twitter) platform.

Your job is to craft engaging responses to interactions:
- Replies to mentions and comments
- Quote tweets that add value
- Responses to trending conversations
- Community engagement in threads

Maintain brand voice while being authentic and conversational.
Avoid controversy. Prioritize helpful, witty, or insightful responses.`,
  model: modelConfig.tier25,
  tools: { craftReply },
});
