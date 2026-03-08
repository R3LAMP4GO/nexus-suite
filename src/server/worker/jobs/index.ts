import type PgBoss from "pg-boss";
import { JobType } from "./types.js";
import type { JobData, ContentPublishJob, ContentScheduleJob, ScraperRunJob, AgentExecuteJob } from "./types.js";
import { handleContentPublish } from "./handlers/content-publish.js";
import { handleContentSchedule } from "./handlers/content-schedule.js";
import { handleScraperRun } from "./handlers/scraper-run.js";
import { handleAgentExecute } from "./handlers/agent-execute.js";

export function registerJobHandlers(boss: PgBoss): void {
  // CONTENT_PUBLISH — immediate publish to platforms
  boss.work<ContentPublishJob>(JobType.CONTENT_PUBLISH, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.CONTENT_PUBLISH} job=${job.id}`);
      await handleContentPublish(job);
    }
  });

  // CONTENT_SCHEDULE — create PostRecord + enqueue delayed post:task
  boss.work<ContentScheduleJob>(JobType.CONTENT_SCHEDULE, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.CONTENT_SCHEDULE} job=${job.id}`);
      await handleContentSchedule(boss, job);
    }
  });

  // SCRAPER_RUN — forward to scrape:task queue for scraper-pool consumer
  boss.work<ScraperRunJob>(JobType.SCRAPER_RUN, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.SCRAPER_RUN} job=${job.id}`);
      await handleScraperRun(boss, job);
    }
  });

  // AGENT_EXECUTE — resolve agent from registry + execute
  boss.work<AgentExecuteJob>(JobType.AGENT_EXECUTE, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing ${JobType.AGENT_EXECUTE} job=${job.id}`);
      await handleAgentExecute(job);
    }
  });

  // Remaining job types — stub handlers for now
  const stubTypes = [
    JobType.MEDIA_PROCESS,
    JobType.ANALYTICS_SYNC,
    JobType.WEBHOOK_DISPATCH,
  ];

  for (const jobType of stubTypes) {
    boss.work<JobData>(jobType, async (jobs) => {
      for (const job of jobs) {
        console.log(`[worker] processing ${jobType} job=${job.id}`);
        // Job handlers will be implemented in later chunks
      }
    });
  }
}

export { JobType } from "./types.js";
export type { JobData } from "./types.js";
