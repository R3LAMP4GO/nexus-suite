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
const GLOBAL_WORKFLOWS_DIR = join(process.cwd(), "src", "server", "workflows");

export function loadOrgWorkflows(orgId: string): WorkflowDefinition[] {
  const results: WorkflowDefinition[] = [];
  const seenNames = new Set<string>();

  // 1. Load org-specific workflows (higher priority — can override globals)
  const orgDir = join(AGENTS_DIR, orgId, "workflows");
  if (existsSync(orgDir)) {
    const files = readdirSync(orgDir).filter((f) => f.endsWith(".yaml"));
    for (const file of files) {
      const raw = readFileSync(join(orgDir, file), "utf-8");
      const wf = parseYaml(raw) as WorkflowDefinition;
      results.push(wf);
      seenNames.add(wf.name);
    }
  }

  // 2. Load global workflow templates (skip if org has a same-named override)
  if (existsSync(GLOBAL_WORKFLOWS_DIR)) {
    const files = readdirSync(GLOBAL_WORKFLOWS_DIR).filter((f) => f.endsWith(".yaml"));
    for (const file of files) {
      const raw = readFileSync(join(GLOBAL_WORKFLOWS_DIR, file), "utf-8");
      const wf = parseYaml(raw) as WorkflowDefinition;
      if (!seenNames.has(wf.name)) {
        results.push(wf);
        seenNames.add(wf.name);
      }
    }
  }

  return results;
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
    // Ensure the workflow definition has the correct organizationId from the job
    match.organizationId = organizationId;
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
