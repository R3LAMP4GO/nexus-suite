import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { executeWorkflow } from "@/server/workflows/executor";
import type { WorkflowDefinition } from "@/server/workflows/workflow-schema";
import type PgBoss from "pg-boss";

export interface WorkflowRunJob {
  workflowName: string;
  organizationId: string;
  triggeredAt: string;
}

const AGENTS_DIR = join(process.cwd(), "src", "agents", "clients");

export function loadOrgWorkflows(orgId: string): WorkflowDefinition[] {
  const workflowDir = join(AGENTS_DIR, orgId, "workflows");
  if (!existsSync(workflowDir)) return [];

  const files = readdirSync(workflowDir).filter((f) => f.endsWith(".yaml"));
  return files.map((file) => {
    const raw = readFileSync(join(workflowDir, file), "utf-8");
    return parseYaml(raw) as WorkflowDefinition;
  });
}

export async function handleWorkflowRun(
  job: PgBoss.Job<WorkflowRunJob>,
): Promise<void> {
  const { workflowName, organizationId, triggeredAt } = job.data;

  console.log(
    `[workflow-run] starting workflow="${workflowName}" org=${organizationId} job=${job.id} triggeredAt=${triggeredAt}`,
  );

  const workflows = loadOrgWorkflows(organizationId);
  const match = workflows.find((w) => w.name === workflowName);

  if (!match) {
    const err = `Workflow "${workflowName}" not found for org=${organizationId}`;
    console.error(`[workflow-run] ${err}`);
    throw new Error(err);
  }

  try {
    const result = await executeWorkflow(match);
    console.log(
      `[workflow-run] completed workflow="${workflowName}" org=${organizationId} job=${job.id} status=${result.status} durationMs=${result.durationMs}`,
    );

    if (result.status === "failed") {
      throw new Error(
        `Workflow "${workflowName}" finished with status=failed: ${result.error ?? "unknown error"}`,
      );
    }
  } catch (err) {
    console.error(
      `[workflow-run] failed workflow="${workflowName}" org=${organizationId} job=${job.id}`,
      err,
    );
    throw err;
  }
}
