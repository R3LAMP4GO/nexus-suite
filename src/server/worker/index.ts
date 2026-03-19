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
import { startEngagementWorker, stopEngagementWorker } from "../workers/engagement-worker.js";
import { disposeExecutor } from "../services/warming/executor";
import { workerLogger } from "@/lib/logger";

const boss = createBoss();

async function start(): Promise<void> {
  workerLogger.info("bootstrapping agent registry...");
  bootstrapAgents();

  workerLogger.info("starting pg-boss...");
  await boss.start();
  await registerJobHandlers(boss);

  workerLogger.info("registering workflow actions...");
  registerWorkflowActions();

  workerLogger.info("registering cron workflows...");
  await registerCronWorkflows(boss);

  workerLogger.info("starting competitor worker...");
  await startCompetitorWorker();

  workerLogger.info("starting post worker...");
  await startPostWorker();

  workerLogger.info("starting competitor polling worker...");
  await startCompetitorPollingWorker();

  workerLogger.info("starting media completion worker...");
  await startMediaCompletionWorker();

  workerLogger.info("starting distribution worker...");
  await startDistributionWorker();

  workerLogger.info("starting engagement worker...");
  await startEngagementWorker();

  workerLogger.info("ready");
}

async function shutdown(): Promise<void> {
  workerLogger.info("shutting down...");
  await stopCompetitorWorker();
  await stopCompetitorPollingWorker();
  await stopPostWorker();
  await stopMediaCompletionWorker();
  await stopDistributionWorker();
  await stopEngagementWorker();
  await disposeExecutor();
  await boss.stop();
  workerLogger.info("stopped");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start().catch((err) => {
  workerLogger.error({ err }, "fatal");
  process.exit(1);
});
