import { executeAgentDelegate } from "@/server/workflows/agent-delegate";
import { checkLlmBudget } from "@/server/services/llm-budget";
import { incCounter, observeHistogram } from "@/lib/metrics";
import type { AgentExecuteJob } from "../types.js";
import type { Job } from "pg-boss";

export async function handleAgentExecute(
  job: Job<AgentExecuteJob>,
): Promise<void> {
  const { agentId, input, organizationId } = job.data;

  console.log(`[agent-execute] running agent=${agentId} org=${organizationId} job=${job.id}`);

  const budgetCheck = await checkLlmBudget(organizationId);
  if (!budgetCheck.allowed) {
    throw new Error(`LLM_BUDGET_EXCEEDED: ${budgetCheck.message}`);
  }

  const prompt = typeof input.prompt === "string" ? input.prompt : JSON.stringify(input);

  const start = performance.now();
  const result = await executeAgentDelegate(agentId, prompt, {
    organizationId,
    workflowName: `job:agent-execute`,
    runId: job.id!,
    variables: {},
    config: {},
    input,
    aborted: false,
  });

  const durationSec = (performance.now() - start) / 1000;
  await Promise.all([
    incCounter("agent_calls_total", { agent_id: agentId }),
    observeHistogram("agent_duration_seconds", { agent_id: agentId }, durationSec),
  ]);

  console.log(`[agent-execute] completed agent=${agentId} job=${job.id}`, result);
}
