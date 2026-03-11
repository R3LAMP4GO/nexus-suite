import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler, socialPostTool } from "@/agents/general";
import { modelConfig } from "@/agents/platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";

const AGENT_NAME = "engagement-responder";

const INSTRUCTIONS = `You are the Engagement Responder for Nexus Suite.

Single task: Reply to comments and mentions with on-brand responses.

Capabilities:
- Analyze comment sentiment (positive, negative, neutral, spam)
- Generate contextual replies that maintain brand voice
- Apply reply templates for common scenarios (thanks, FAQ, complaints)
- Prioritize high-engagement comments for reply

Output format:
Return JSON with:
- "reply": the response text
- "sentiment": detected sentiment of original comment
- "priority": reply priority (high, medium, low)
- "template_used": which reply template was applied
- "escalate": boolean if human review needed`;

const getRecentComments = createTool({
  id: "getRecentComments",
  description: "Fetch comments and mentions needing response",
  inputSchema: z.object({
    platform: z.string().describe("Platform to fetch comments from"),
    limit: z.number().optional().describe("Max comments to return"),
    unrespondedOnly: z.boolean().optional().describe("Only fetch unresponded comments"),
  }),
  execute: async (executionContext) => {
    const { platform, limit, unrespondedOnly } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { platform: string; limit?: number; unrespondedOnly?: boolean }) => ({
        platform: input.platform,
        limit: input.limit ?? 50,
        unrespondedOnly: input.unrespondedOnly ?? true,
        comments: [] as Record<string, unknown>[],
        status: "pending-integration" as const,
      }),
      { agentName: AGENT_NAME, toolName: "getRecentComments" },
    );
    return wrappedFn({ platform, limit, unrespondedOnly });
  },
});

const engagementResponderAgent = new Agent({
  name: AGENT_NAME,
  instructions: INSTRUCTIONS,
  model: modelConfig.tier25,
  tools: { getRecentComments, socialPostTool },
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
    ctx.organizationId as string | undefined,
  );

  const result = await engagementResponderAgent.generate(prompt, {
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
