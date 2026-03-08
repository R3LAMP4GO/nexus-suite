import PgBoss from "pg-boss";

// ── Types ─────────────────────────────────────────────────────

interface CompetitorTaskPayload {
  jobType: "analyze" | "reproduce";
  postId: string;
  url: string;
  organizationId: string;
}

// ── Worker ────────────────────────────────────────────────────

const QUEUE_NAME = "competitor:task";

let boss: PgBoss | null = null;

async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss(process.env.DATABASE_URL!);
    await boss.start();
  }
  return boss;
}

export async function startCompetitorWorker(): Promise<void> {
  const b = await getBoss();

  await b.work<CompetitorTaskPayload>(
    QUEUE_NAME,
    { batchSize: 1 },
    async ([job]) => {
      const { jobType, postId, url, organizationId } = job.data;

      console.log(
        `[competitor-worker] received ${jobType} job — postId=${postId} url=${url} org=${organizationId}`,
      );

      switch (jobType) {
        case "analyze":
          // TODO: implement analysis pipeline
          console.log(`[competitor-worker] analyze stub complete for postId=${postId}`);
          break;
        case "reproduce":
          // TODO: implement reproduction pipeline
          console.log(`[competitor-worker] reproduce stub complete for postId=${postId}`);
          break;
      }
    },
  );

  console.log("[competitor-worker] listening on queue:", QUEUE_NAME);
}

export async function stopCompetitorWorker(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
  }
}
