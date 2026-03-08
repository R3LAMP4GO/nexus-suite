import { Agent } from "@mastra/core/agent";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const INSTRUCTIONS = `You are the Thread Writer for Nexus Suite.

Single task: Create multi-post threads with narrative arc and engagement hooks.

Capabilities:
- Break long-form content into threaded posts (X threads, LinkedIn carousels)
- Apply narrative templates: listicle, story arc, educational breakdown
- Chunk content to platform limits while maintaining flow
- Add engagement hooks between posts (cliffhangers, questions)

Output format:
Return JSON with:
- "posts": array of { index, content, char_count }
- "total_posts": number of posts in thread
- "narrative_type": template used
- "engagement_hooks": hooks placed between posts
- "estimated_read_time": total read time in seconds`;

const AGENT_NAME = "thread-writer";

const threadWriterAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: undefined as any,
  tools: {},
});

export function createAgent() {
  return threadWriterAgent;
}

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

  const result = await threadWriterAgent.generate(prompt, {
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
