// LinkedIn sub-agent: Article Formatter — Tier 2.5
// Formats long-form articles for LinkedIn's publishing platform.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";

const formatLinkedInArticle = createTool({
  id: "formatLinkedInArticle",
  description: "Takes raw content and returns a structured LinkedIn article with headline, sections, and tags",
  inputSchema: z.object({
    rawContent: z.string().describe("Raw content to format into a LinkedIn article"),
    targetAudience: z.string().optional().describe("Target professional audience (e.g. CTOs, marketers)"),
    tone: z.string().optional().describe("Article tone (e.g. thought-leadership, educational, case-study)"),
  }),
  execute: async (input) => {
    const { rawContent, targetAudience, tone } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { rawContent: string; targetAudience?: string; tone?: string }) => {
        const audience = input.targetAudience ?? "general professionals";
        const tone = input.tone ?? "thought-leadership";
        const contentLength = input.rawContent.length;
        const wordCount = input.rawContent.split(/\s+/).length;

        // Generate headline options
        const topicWords = input.rawContent.slice(0, 200).split(/\s+/).filter((w) => w.length > 4).slice(0, 3);
        const topicPhrase = topicWords.join(" ");

        const headlines = [
          `Why ${topicPhrase} Matters More Than You Think`,
          `The ${audience}'s Guide to ${topicPhrase}`,
          `I Was Wrong About ${topicPhrase} — Here's What Changed My Mind`,
          `${topicPhrase}: What the Data Actually Shows`,
        ];

        // Calculate section structure
        const sectionCount = Math.max(3, Math.min(7, Math.ceil(wordCount / 200)));
        const sections = [
          { heading: "The Problem", wordTarget: Math.round(wordCount * 0.15), purpose: "Hook the reader with a relatable pain point or surprising insight" },
          ...Array.from({ length: sectionCount - 2 }, (_, i) => ({
            heading: `Key Insight ${i + 1}`,
            wordTarget: Math.round(wordCount * 0.6 / (sectionCount - 2)),
            purpose: "Deliver one actionable point with evidence or a story",
          })),
          { heading: "What This Means for You", wordTarget: Math.round(wordCount * 0.15), purpose: "Actionable takeaways the reader can apply today" },
          { heading: "The Bottom Line", wordTarget: Math.round(wordCount * 0.1), purpose: "Summary + CTA to comment/follow/connect" },
        ];

        // Generate relevant tags
        const TAG_MAP: Record<string, string[]> = {
          "thought-leadership": ["Leadership", "Innovation", "Strategy"],
          "educational": ["Learning", "Professional Development", "Career Growth"],
          "case-study": ["Business Strategy", "Case Study", "Results"],
          "opinion": ["Industry Insights", "Perspective", "Trends"],
        };
        const tags = TAG_MAP[tone] ?? TAG_MAP["thought-leadership"];

        const TONE_GUIDE: Record<string, string> = {
          "thought-leadership": "Authoritative but humble. Share opinions backed by experience. Use 'I've found' not 'You should'.",
          "educational": "Teacher mode. Step-by-step clarity. Use numbered lists and examples. Define jargon.",
          "case-study": "Data-forward storytelling. Before/after structure. Specific numbers and timelines.",
          "opinion": "Take a clear stance. Acknowledge counterarguments. Invite respectful debate.",
        };

        return {
          rawContent: input.rawContent.slice(0, 200) + (contentLength > 200 ? "..." : ""),
          targetAudience: audience,
          tone,
          headlines,
          sections,
          tags,
          formatting: {
            idealWordCount: "800-2000 words for maximum reach",
            currentWordCount: wordCount,
            headlineLength: "60-80 characters for full display on desktop and mobile",
            paragraphLength: "2-3 sentences max — LinkedIn readers scan on mobile",
            visualBreaks: "Add a line break every 2-3 paragraphs. Use bold for key phrases.",
            pullQuotes: "Highlight 1-2 standout statistics or quotes as standalone paragraphs",
          },
          toneGuidance: TONE_GUIDE[tone] ?? TONE_GUIDE["thought-leadership"],
          linkedInBestPractices: [
            "First 2 lines appear in the preview — make them irresistible",
            "Articles published Tuesday-Thursday 8-10am get highest engagement",
            "Include a cover image — articles with images get 94% more views",
            `Write for ${audience}: use their language, reference their challenges`,
            "End with a question to drive comments — LinkedIn rewards comment velocity",
            "Cross-post a teaser as a regular post linking to the article",
            "Tag 3-5 relevant people who might share or comment",
          ],
        };
      },
      { agentName: "article-formatter", toolName: "formatLinkedInArticle" },
    );
    return wrappedFn({ rawContent, targetAudience, tone });
  },
});

export const articleFormatterAgent = new Agent({
  id: "article-formatter",
  name: "Article Formatter",
  instructions: `You are an Article Formatter sub-agent for the LinkedIn platform.

Your job is to format long-form content for LinkedIn Articles:
- Compelling headline (60-80 chars for full display)
- Cover image recommendation
- Introduction that hooks professionals (problem/insight)
- Subheadings every 2-3 paragraphs for scannability
- Pull quotes or key statistics highlighted
- Conclusion with actionable takeaways
- Author bio/CTA at the end

Articles should be 800-2000 words. Use data and case studies.
Format for both mobile and desktop reading.
Include relevant tags (up to 3) for discoverability.`,
  model: modelConfig.tier25,
  tools: { formatLinkedInArticle },
});
