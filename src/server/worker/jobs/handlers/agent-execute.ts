import { executeAgentDelegate } from "@/server/workflows/agent-delegate";
import type { AgentExecuteJob } from "../types.js";
import type PgBoss from "pg-boss";

export async function handleAgentExecute(
  job: PgBoss.Job<AgentExecuteJob>,
): Promise<void> {
  const { agentId, input, organizationId } = job.data;

  console.log(`[agent-execute] running agent=${agentId} org=${organizationId} job=${job.id}`);

  const prompt = typeof input.prompt === "string" ? input.prompt : JSON.stringify(input);

  const result = await executeAgentDelegate(agentId, prompt, {
    organizationId,
    workflowName: `job:agent-execute`,
    runId: job.id!,
    variables: {},
    config: {},
    input,
    aborted: false,
  });

  console.log(`[agent-execute] completed agent=${agentId} job=${job.id}`, result);
}
