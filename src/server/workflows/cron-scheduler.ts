import { readdirSync, existsSync } from "fs";
import { join } from "path";
import type PgBoss from "pg-boss";
import { loadOrgWorkflows } from "@/server/worker/jobs/handlers/workflow-run";
import type { WorkflowRunJob } from "@/server/worker/jobs/handlers/workflow-run";
import { JobType } from "@/server/worker/jobs/types";

const CLIENTS_DIR = join(process.cwd(), "src", "agents", "clients");

/**
 * Discover all organization directories under `src/agents/clients/`.
 * Skips the `_example` template and non-directory entries.
 */
function discoverOrganizations(): string[] {
  if (!existsSync(CLIENTS_DIR)) return [];

  return readdirSync(CLIENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name);
}

/**
 * Register pg-boss scheduled jobs for every workflow that uses
 * `trigger.type: "cron"`. Should be called once during worker startup
 * after `registerJobHandlers()`.
 *
 * @param boss  - A started pg-boss instance
 * @param orgIds - Explicit list of org IDs; omit to auto-discover from disk
 */
export async function registerCronWorkflows(
  boss: PgBoss,
  orgIds?: string[],
): Promise<void> {
  const organizations = orgIds ?? discoverOrganizations();
  let registered = 0;

  for (const orgId of organizations) {
    const workflows = loadOrgWorkflows(orgId);

    for (const workflow of workflows) {
      if (workflow.trigger.type !== "cron") continue;

      const cronSchedule = workflow.trigger.schedule;
      const singletonKey = `workflow:cron:${orgId}:${workflow.name}`;

      const payload: WorkflowRunJob = {
        workflowName: workflow.name,
        organizationId: orgId,
        triggeredAt: new Date().toISOString(),
      };

      await boss.schedule(JobType.WORKFLOW_RUN, cronSchedule, payload, {
        singletonKey,
      });

      registered++;
      console.log(
        `[cron-scheduler] registered workflow="${workflow.name}" org=${orgId} schedule="${cronSchedule}"`,
      );
    }
  }

  console.log(
    `[cron-scheduler] ${registered} cron workflow(s) registered across ${organizations.length} org(s)`,
  );
}
