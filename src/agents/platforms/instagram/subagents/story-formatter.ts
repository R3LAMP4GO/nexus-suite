// Instagram sub-agent: Story Formatter — Tier 2.5
// Formats content for Instagram Stories with interactive elements.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";

const formatStorySequence = createTool({
  id: "formatStorySequence",
  description: "Generate an Instagram Story slide plan with interactive element recommendations",
  inputSchema: z.object({
    content: z.string().describe("Raw content to format into story slides"),
    goal: z.string().optional().describe("Story goal (e.g. engagement, traffic, awareness)"),
  }),
  execute: async (executionContext) => {
    const { content, goal } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { content: string; goal?: string }) => {
        const goal = input.goal ?? "engagement";
        const contentLength = input.content.length;

        // Calculate optimal slide count based on content length
        const slideCount = Math.max(3, Math.min(10, Math.ceil(contentLength / 200)));

        // Split content into chunks for slides
        const sentences = input.content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
        const slidePlan: Array<{ slideNumber: number; content: string; type: string; duration: string; interactiveElement: string | null }> = [];

        // Opening slide — always a hook
        slidePlan.push({
          slideNumber: 1,
          content: sentences[0]?.trim() ?? input.content.slice(0, 100),
          type: "hook",
          duration: "5s",
          interactiveElement: null,
        });

        // Content slides with interactive elements
        const interactiveOptions: Record<string, string[]> = {
          engagement: ["poll", "quiz", "emoji-slider", "question-box"],
          traffic: ["link-sticker", "swipe-up", "see-more"],
          awareness: ["location-sticker", "hashtag-sticker", "mention-sticker", "poll"],
        };
        const elements = interactiveOptions[goal] ?? interactiveOptions.engagement;

        for (let i = 1; i < Math.min(sentences.length, slideCount - 1); i++) {
          const useInteractive = i === Math.floor(slideCount / 2) || i === slideCount - 2;
          slidePlan.push({
            slideNumber: i + 1,
            content: sentences[i]?.trim() ?? "",
            type: "content",
            duration: "5s",
            interactiveElement: useInteractive ? elements[i % elements.length] : null,
          });
        }

        // Closing slide — CTA
        const ctaMap: Record<string, string> = {
          engagement: "DM me 'YES' for the full guide 👇",
          traffic: "Link in bio for the complete breakdown 🔗",
          awareness: "Share this with someone who needs to see it 💫",
        };

        slidePlan.push({
          slideNumber: slidePlan.length + 1,
          content: ctaMap[goal] ?? ctaMap.engagement,
          type: "cta",
          duration: "5s",
          interactiveElement: goal === "traffic" ? "link-sticker" : "question-box",
        });

        return {
          content: input.content.slice(0, 200) + (input.content.length > 200 ? "..." : ""),
          goal,
          slides: slidePlan,
          interactiveElements: slidePlan.filter((s) => s.interactiveElement).map((s) => s.interactiveElement!),
          formatSpecs: {
            dimensions: "1080x1920 (9:16)",
            textSafeZone: { top: 120, bottom: 200, left: 40, right: 40 },
            fontSizes: { headline: "48-64px", body: "28-36px", cta: "32-40px" },
            maxTextPerSlide: "3 lines / ~80 characters",
          },
          designTips: [
            "Use consistent brand colors across all slides",
            "One idea per slide — don't overcrowd",
            "Add subtle motion (text animation) to prevent skip-throughs",
            "Place interactive elements in the center-bottom area for easy thumb reach",
            "Last slide should always have a clear action",
          ],
          totalSlides: slidePlan.length,
          estimatedViewTime: `${slidePlan.length * 5}s`,
        };
      },
      { agentName: "story-formatter", toolName: "formatStorySequence" },
    );
    return wrappedFn({ content, goal });
  },
});

export const storyFormatterAgent = new Agent({
  id: "story-formatter",
  name: "Story Formatter",
  instructions: `You are a Story Formatter sub-agent for the Instagram platform.

Your job is to format content for Instagram Stories:
- 9:16 vertical format, 1080x1920px
- 15-second segments for video, tappable for images
- Interactive elements: polls, quizzes, questions, sliders, countdowns
- Link stickers for CTAs
- Location and hashtag stickers for reach
- Text placement in safe zones (avoid top/bottom UI overlap)

Story sequence planning:
- Opening story: hook to stop tapping through
- Content stories: deliver value with interactive elements
- Closing story: CTA (swipe up, DM, link, poll)

Keep text minimal and readable. Use brand colors and fonts consistently.`,
  model: modelConfig.tier25,
  tools: { formatStorySequence },
});
