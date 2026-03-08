import type PgBoss from "pg-boss";
import type { ScraperRunJob } from "../types.js";

export async function handleScraperRun(
  boss: PgBoss,
  job: PgBoss.Job<ScraperRunJob>,
): Promise<void> {
  const { targetUrl, profileId, organizationId } = job.data;

  console.log(`[scraper-run] forwarding to scrape:task url=${targetUrl} org=${organizationId}`);

  await boss.send("scrape:task", {
    taskId: job.id!,
    url: targetUrl,
    options: { priority: 0 },
  });

  console.log(`[scraper-run] enqueued scrape:task for profile=${profileId} job=${job.id}`);
}
