import "@/lib/env";
import { createBoss } from "@/lib/pg-boss";
import { bootstrapAgents } from "@/agents/registry";
import { registerJobHandlers } from "./jobs/index.js";
import { registerCronWorkflows } from "@/server/workflows/cron-scheduler";
import { registerWorkflowActions } from "@/server/workflows/actions";
import { startCompetitorWorker, stopCompetitorWorker } from "../workers/competitor-worker.js";
import { startPostWorker, stopPostWorker } from "../workers/post-worker.js";
import { startCompetitorPollingWorker, stopCompetitorPollingWorker } from "../workers/competitor-polling-worker.js";
import { startMediaCompletionWorker, stopMediaCompletionWorker } from "../workers/media-completion-worker.js";
import { startDistributionWorker, stopDistributionWorker } from "../workers/distribution-worker.js";
import { disposeExecutor } from "../services/warming/executor";

const boss = createBoss();

async function start(): Promise<void> {
  console.log("[worker] bootstrapping agent registry...");
  bootstrapAgents();

  console.log("[worker] starting pg-boss...");
  await boss.start();
  await registerJobHandlers(boss);

  console.log("[worker] registering workflow actions...");
  registerWorkflowActions();

  console.log("[worker] registering cron workflows...");
  await registerCronWorkflows(boss);

  console.log("[worker] starting competitor worker...");
  await startCompetitorWorker();

  console.log("[worker] starting post worker...");
  await startPostWorker();

  console.log("[worker] starting competitor polling worker...");
  await startCompetitorPollingWorker();

  console.log("[worker] starting media completion worker...");
  await startMediaCompletionWorker();

  console.log("[worker] starting distribution worker...");
  await startDistributionWorker();

  console.log("[worker] ready");
}

async function shutdown(): Promise<void> {
  console.log("[worker] shutting down...");
  await stopCompetitorWorker();
  await stopCompetitorPollingWorker();
  await stopPostWorker();
  await stopMediaCompletionWorker();
  await stopDistributionWorker();
  await disposeExecutor();
  await boss.stop();
  console.log("[worker] stopped");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
