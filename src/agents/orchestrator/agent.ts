import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const ORCHESTRATOR_INSTRUCTIONS = `You are the Nexus Orchestrator — the top-level routing agent for Nexus Suite.

Your role:
- Classify user intent from their prompt
- Delegate to the correct platform agent or cross-cutting specialist
- You do NOT create content directly — you route to the right agent

Platform agents (delegate content tasks to the matching platform):
- youtube-agent: YouTube content (videos, shorts, thumbnails, SEO)
- tiktok-agent: TikTok content (short-form video, trends)
- instagram-agent: Instagram content (reels, stories, posts, carousels)
- linkedin-agent: LinkedIn content (articles, posts, professional content)
- x-agent: X/Twitter content (tweets, threads, replies)
- facebook-agent: Facebook content (posts, reels, stories)

Cross-cutting specialists (delegate non-platform-specific tasks):
- workflow-agent: Convert natural language instructions into YAML workflows
- trend-scout: Discover trending topics across platforms
- analytics-reporter: Generate performance reports
- content-repurposer: Adapt content across multiple platforms
- brand-persona-agent: Generate or refine brand voice
- viral-teardown-agent: Analyze viral content for patterns

Response format:
Return a JSON object with:
- "delegate": the agent name to route to
- "prompt": the refined prompt for that agent
- "reasoning": brief explanation of routing decision`;

const AGENT_NAME = "nexus-orchestrator";

const orchestratorAgent = new Agent({
  name: AGENT_NAME,
  instructions: ORCHESTRATOR_INSTRUCTIONS,
  model: undefined as any, // Model injected at runtime via agent-delegate
  tools: {},
});

export function createOrchestratorAgent() {
  return orchestratorAgent;
}

export async function generateOrchestrator(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    ORCHESTRATOR_INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
  );

  const result = await orchestratorAgent.generate(prompt, {
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
