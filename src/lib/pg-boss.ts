import PgBoss from "pg-boss";

// ── Shared pg-boss singleton ────────────────────────────────────
// pg-boss.start() must only be called once per database connection.
// All routers, services, and workers share this single instance.

const BOSS_OPTIONS: PgBoss.ConstructorOptions = {
  schema: "pgboss",
  retryLimit: 3,
  retryDelay: 30,
  expireInHours: 24,
  archiveCompletedAfterSeconds: 7 * 86400, // 7 days
  deleteAfterDays: 30,
};

let instance: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

/**
 * Returns the shared pg-boss instance, starting it on first call.
 * Concurrent callers during startup await the same promise (no double-start).
 */
export async function getBoss(): Promise<PgBoss> {
  if (instance) return instance;

  if (!startPromise) {
    startPromise = (async () => {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL is required for pg-boss");

      const boss = new PgBoss({ connectionString, ...BOSS_OPTIONS });
      boss.on("error", (err) => console.error("[pg-boss] error:", err));
      await boss.start();
      instance = boss;
      return boss;
    })();
  }

  return startPromise;
}

/**
 * Returns a raw pg-boss instance without starting.
 * Used by the worker entry point which manages its own lifecycle.
 */
export function createBoss(): PgBoss {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for pg-boss");
  const boss = new PgBoss({ connectionString, ...BOSS_OPTIONS });
  boss.on("error", (err) => console.error("[pg-boss] error:", err));
  return boss;
}

/**
 * Gracefully stops the shared instance.
 * Safe to call even if never started.
 */
export async function stopBoss(): Promise<void> {
  if (instance) {
    await instance.stop({ graceful: true, timeout: 10_000 });
    instance = null;
    startPromise = null;
  }
}
