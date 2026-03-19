import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";
import { modelConfig } from "../platforms/model-config";
import { prepareContext } from "../general/prepare-context";
import { buildSystemPrompt } from "../general/prompts";
import type { RawAgentContext } from "../general/types";
import { validateWorkflow } from "../../server/workflows/validator";

const WORKFLOW_AGENT_INSTRUCTIONS = `You are the Workflow Agent for Nexus Suite.

Your role:
- Interpret natural language descriptions of automation workflows
- Convert them into valid YAML workflow definitions
- Validate the output before returning

Workflow YAML schema structure:
- name: string (1-100 chars)
- description: string (optional, max 500 chars)
- organizationId: string (provided in context)
- trigger: { type: "manual" | "cron" | "event", schedule?: string, event?: string }
- config: key-value pairs (optional)
- input: input type declarations (optional)
- steps: array of step objects (min 1)

Step types:
- action: { type: "action", id: string, action: "service.method", params: {} }
- agent-delegate: { type: "agent-delegate", id: string, agent: "agent-name", prompt: "..." }
- condition: { type: "condition", id: string, condition: "{{var}} >= 7", onTrue: [...], onFalse: [...] }
- forEach: { type: "forEach", id: string, collection: "{{items}}", as: "item", steps: [...] }
- while: { type: "while", id: string, condition: "...", maxIterations: 10, steps: [...] }
- parallel: { type: "parallel", id: string, steps: [...] }

Common step properties:
- dependsOn: ["step-id"] (optional)
- outputAs: "varName" (optional, makes output available as {{varName}})
- retries: 0-5 (optional)
- timeoutMs: positive integer (optional)

Variable references use {{varName}} syntax.
Use the validate_workflow tool to check your output before returning.

Return the valid YAML string as your response.`;

const AGENT_NAME = "workflow-agent";

const validateWorkflowTool = createTool({
  id: "validate_workflow",
  description: "Validate a workflow YAML string against the Nexus workflow schema",
  inputSchema: z.object({
    yaml: z.string().describe("The YAML workflow definition to validate"),
  }),
  outputSchema: z.object({
    valid: z.boolean(),
    errors: z.array(z.object({
      layer: z.string(),
      path: z.string(),
      message: z.string(),
    })),
    warnings: z.array(z.string()),
  }),
  execute: async (input) => {
    const wrappedFn = wrapToolHandler(
      async (toolInput: { yaml: string }) => validateWorkflow(toolInput.yaml),
      { agentName: AGENT_NAME, toolName: "validate_workflow" },
    );
    return wrappedFn({ yaml: input.yaml });
  },
});

const workflowAgent = new Agent({
  id: AGENT_NAME,
  name: AGENT_NAME,
  instructions: WORKFLOW_AGENT_INSTRUCTIONS,
  model: modelConfig.tier1,
  tools: { validate_workflow: validateWorkflowTool },
});

export function createWorkflowAgent() {
  return workflowAgent;
}

export async function generateWorkflow(
  prompt: string,
  rawContext: RawAgentContext,
  opts?: { model?: string; maxTokens?: number },
) {
  const ctx = prepareContext(AGENT_NAME, rawContext);
  const systemPrompt = buildSystemPrompt(
    WORKFLOW_AGENT_INSTRUCTIONS,
    ctx.brandVoice as string | undefined,
    ctx.organizationId as string | undefined,
  );

  const result = await workflowAgent.generate(prompt, {
    instructions: systemPrompt,
    modelSettings: opts?.maxTokens ? { maxOutputTokens: opts.maxTokens } : undefined,
  });

  return {
    text: result.text,
    usage: result.usage
      ? {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          model: opts?.model ?? "default",
        }
      : undefined,
    toolCalls: result.toolCalls?.map((tc) => ({
      name: tc.payload.toolName,
      args: tc.payload.args as Record<string, unknown>,
      result: undefined,
    })),
  };
}
