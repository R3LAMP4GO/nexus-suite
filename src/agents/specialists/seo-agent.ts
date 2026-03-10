import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the SEO Agent for Nexus Suite.

Single task: Keyword research + content optimization for search visibility.

Capabilities:
- Research high-volume, low-competition keywords for content topics
- Optimize titles, descriptions, and body text for target keywords
- Analyze competitor keyword strategies
- Suggest internal linking opportunities
- Generate meta descriptions and alt text

Output format:
Return JSON with:
- "primary_keyword": main target keyword
- "secondary_keywords": array of supporting keywords
- "keyword_density": recommended density percentage
- "title_suggestion": SEO-optimized title
- "meta_description": max 160 chars
- "optimization_notes": specific recommendations`;

const AGENT_NAME = "seo-agent";

const tavilySearch = createTool({
  id: "tavilySearch",
  description: "Search the web for SEO keyword research and competitor analysis",
  inputSchema: z.object({
    query: z.string().describe("Search query for SEO research"),
    searchDepth: z.enum(["basic", "advanced"]).optional().describe("Search depth"),
  }),
  execute: async (executionContext) => {
    const { query, searchDepth } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; searchDepth?: string }) => ({
        query: input.query,
        searchDepth: input.searchDepth ?? "basic",
        results: [] as Array<{ title: string; url: string; snippet: string }>,
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "tavilySearch" },
    );
    return wrappedFn({ query, searchDepth });
  },
});

const youtubeSearch = createTool({
  id: "youtubeSearch",
  description: "Search YouTube for keyword performance and competitor videos",
  inputSchema: z.object({
    query: z.string().describe("YouTube search query"),
    maxResults: z.number().optional().describe("Number of results"),
  }),
  execute: async (executionContext) => {
    const { query, maxResults } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { query: string; maxResults?: number }) => ({
        query: input.query,
        maxResults: input.maxResults ?? 10,
        videos: [] as Array<{ title: string; views: number; channel: string }>,
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "youtubeSearch" },
    );
    return wrappedFn({ query, maxResults });
  },
});

const getKeywordMetrics = createTool({
  id: "getKeywordMetrics",
  description: "Get search volume, competition, and difficulty metrics for keywords",
  inputSchema: z.object({
    keywords: z.array(z.string()).describe("Keywords to analyze"),
    region: z.string().optional().describe("Geographic region"),
  }),
  execute: async (executionContext) => {
    const { keywords, region } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { keywords: string[]; region?: string }) => ({
        region: input.region ?? "global",
        metrics: input.keywords.map((kw) => ({ keyword: kw, volume: 0, competition: "unknown", difficulty: 0 })),
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getKeywordMetrics" },
    );
    return wrappedFn({ keywords, region });
  },
});

const seoAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { tavilySearch, youtubeSearch, getKeywordMetrics },
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
  );

  const result = await seoAgent.generate(prompt, {
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
