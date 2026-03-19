// Example: client-specific tool.
// Niche-specific tools are loaded by the plugin resolver and made available
// to the client's custom agents. They do NOT have direct Infisical access —
// credentials are injected by the worker via prepareContext().

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general/index.js";

/** Niche research tool: fetch keywords and trending topics for a given niche. */
export const fetchNicheKeywords = createTool({
  id: "fetchNicheKeywords",
  description: "Fetch keyword ideas, competition data, and trending topics for a content niche",
  inputSchema: z.object({
    niche: z.string().describe("Content niche to research (e.g. fitness, tech, finance)"),
    region: z.string().optional().describe("Region for keyword data (defaults to global)"),
  }),
  execute: async (input) => {
    const { niche, region } = input;
    const wrappedFn = wrapToolHandler(
      async (input: { niche: string; region?: string }) => {
        const NICHE_DATA: Record<string, { keywords: string[]; avgVolume: number; competition: string; trending: string[] }> = {
          fitness: {
            keywords: ["home workout", "weight loss tips", "gym motivation", "meal prep", "protein shake recipes"],
            avgVolume: 45000,
            competition: "high",
            trending: ["walking pad", "zone 2 cardio", "12-3-30 workout"],
          },
          tech: {
            keywords: ["AI tools", "productivity apps", "coding tutorials", "tech reviews", "startup tips"],
            avgVolume: 62000,
            competition: "high",
            trending: ["local LLMs", "AI agents", "vibe coding"],
          },
          finance: {
            keywords: ["passive income", "investing for beginners", "budgeting tips", "side hustles", "crypto basics"],
            avgVolume: 38000,
            competition: "medium",
            trending: ["high yield savings", "FIRE movement", "dividend investing"],
          },
          beauty: {
            keywords: ["skincare routine", "makeup tutorial", "clean beauty", "hair care tips", "drugstore dupes"],
            avgVolume: 55000,
            competition: "high",
            trending: ["skin cycling", "glass skin", "lip combo"],
          },
          education: {
            keywords: ["study tips", "online courses", "language learning", "career change", "skill development"],
            avgVolume: 28000,
            competition: "low",
            trending: ["micro-credentials", "AI tutoring", "learn to code"],
          },
        };

        const nicheKey = input.niche.toLowerCase();
        const data = NICHE_DATA[nicheKey] ?? {
          keywords: [`${input.niche} tips`, `${input.niche} for beginners`, `best ${input.niche}`, `${input.niche} guide`, `${input.niche} trends`],
          avgVolume: 15000,
          competition: "unknown",
          trending: [`${input.niche} 2024`, `${input.niche} AI`],
        };

        return {
          niche: input.niche,
          region: input.region ?? "global",
          keywords: data.keywords,
          avgMonthlyVolume: data.avgVolume,
          competition: data.competition,
          trendingTopics: data.trending,
          contentAngles: [
            `Beginner's guide to ${input.niche}`,
            `Top 5 ${input.niche} mistakes to avoid`,
            `${input.niche} myths debunked`,
            `How I got into ${input.niche} — personal story`,
          ],
        };
      },
      { agentName: "client-plugin", toolName: "fetchNicheKeywords" },
    );
    return wrappedFn({ niche, region });
  },
});
