import type PgBoss from "pg-boss";
import { incCounter, observeHistogram } from "@/lib/metrics";
import { JobType } from "./types.js";
import type { JobData, ContentPublishJob, ContentScheduleJob, ScraperRunJob, MediaRenderJob, AgentExecuteJob, AnalyticsSyncJob, WebhookDispatchJob } from "./types.js";
import { handleContentPublish } from "./handlers/content-publish.js";
import { handleContentSchedule } from "./handlers/content-schedule.js";
import { handleScraperRun } from "./handlers/scraper-run.js";
import { handleMediaRender } from "./handlers/media-render.js";
import { handleAgentExecute } from "./handlers/agent-execute.js";
import { handleAnalyticsSync } from "./handlers/analytics-sync.js";
import { handleWebhookDispatch } from "./handlers/webhook-dispatch.js";
import { handleWorkflowRun, type WorkflowRunJob } from "./handlers/workflow-run.js";
import { WARM_TASK_QUEUE, type WarmTask } from "@/server/services/warming/queue";
import { executeWarmTask } from "@/server/services/warming/executor";

async function instrumentedWork<T>(
  queue: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  let status = "success";
  try {
    return await fn();
  } catch (err) {
    status = "failed";
    throw err;
  } finally {
    const durationSec = (performance.now() - start) / 1000;
    await Promise.all([
      incCounter("jobs_processed_total", { queue, status }),
      observeHistogram("job_duration_seconds", { queue }, durationSec),
    ]);
  }
}

export async function registerJobHandlers(boss: PgBoss): Promise<void> {
  // CONTENT_PUBLISH — immediate publish to platforms
  await boss.work<ContentPublishJob>(JobType.CONTENT_PUBLISH, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.CONTENT_PUBLISH} job=${job.id}`);
      await instrumentedWork(JobType.CONTENT_PUBLISH, () => handleContentPublish(job));
    }
  });

  // CONTENT_SCHEDULE — create PostRecord + enqueue delayed post:task
  await boss.work<ContentScheduleJob>(JobType.CONTENT_SCHEDULE, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.CONTENT_SCHEDULE} job=${job.id}`);
      await instrumentedWork(JobType.CONTENT_SCHEDULE, () => handleContentSchedule(boss, job));
    }
  });

  // SCRAPER_RUN — forward to scrape:task queue for scraper-pool consumer
  await boss.work<ScraperRunJob>(JobType.SCRAPER_RUN, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.SCRAPER_RUN} job=${job.id}`);
      await instrumentedWork(JobType.SCRAPER_RUN, () => handleScraperRun(boss, job));
    }
  });

  // AGENT_EXECUTE — resolve agent from registry + execute
  await boss.work<AgentExecuteJob>(JobType.AGENT_EXECUTE, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.AGENT_EXECUTE} job=${job.id}`);
      await instrumentedWork(JobType.AGENT_EXECUTE, () => handleAgentExecute(job));
    }
  });

  // ANALYTICS_SYNC — fetch platform metrics
  await boss.work<AnalyticsSyncJob>(JobType.ANALYTICS_SYNC, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.ANALYTICS_SYNC} job=${job.id}`);
      await instrumentedWork(JobType.ANALYTICS_SYNC, () => handleAnalyticsSync(job));
    }
  });

  // WEBHOOK_DISPATCH — POST payload with exponential backoff
  await boss.work<WebhookDispatchJob>(JobType.WEBHOOK_DISPATCH, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.WEBHOOK_DISPATCH} job=${job.id}`);
      await instrumentedWork(JobType.WEBHOOK_DISPATCH, () => handleWebhookDispatch(job));
    }
  });

  // WORKFLOW_RUN — execute org workflow definitions from YAML
  await boss.work<WorkflowRunJob>(JobType.WORKFLOW_RUN, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.WORKFLOW_RUN} job=${job.id}`);
      await instrumentedWork(JobType.WORKFLOW_RUN, () => handleWorkflowRun(job));
    }
  });

  // MEDIA_PROCESS — stub, not in scope for this feature
  await boss.work<JobData>(JobType.MEDIA_PROCESS, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.MEDIA_PROCESS} job=${job.id}`);
      await instrumentedWork(JobType.MEDIA_PROCESS, () => Promise.resolve());
    }
  });

  // MEDIA_RENDER — BatchEdit combinatorial render pipeline (Hook+Meat+CTA → FFmpeg → R2)
  await boss.work<MediaRenderJob>(JobType.MEDIA_RENDER, { batchSize: 1 }, async ([job]) => {
    console.log(`[worker] processing ${JobType.MEDIA_RENDER} job=${job.id}`);
    await instrumentedWork(JobType.MEDIA_RENDER, () => handleMediaRender(job));
  });

  // WARM_TASK — browser-based account warming (1 task at a time)
  await boss.work<WarmTask>(WARM_TASK_QUEUE, { batchSize: 1 }, async ([job]) => {
    console.log(`[worker] processing ${WARM_TASK_QUEUE} job=${job.id}`);
    await instrumentedWork(WARM_TASK_QUEUE, () => executeWarmTask(job.data));
  });
}

export { JobType } from "./types.js";
export type { JobData } from "./types.js";
