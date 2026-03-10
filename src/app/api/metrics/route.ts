import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379/0");

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.METRICS_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const lines: string[] = [];

  // ── circuit_breaker_state (gauge per account) ──────────────────
  // Maps CircuitState enum to numeric: CLOSED=0, HALF_OPEN=1, OPEN=2
  const stateMap: Record<string, number> = { CLOSED: 0, HALF_OPEN: 1, OPEN: 2 };

  try {
    const tokens = await db.orgPlatformToken.findMany({
      select: {
        organizationId: true,
        platform: true,
        accountLabel: true,
        circuitState: true,
      },
    });

    lines.push("# HELP circuit_breaker_state Circuit breaker state per account (0=closed, 1=half_open, 2=open)");
    lines.push("# TYPE circuit_breaker_state gauge");
    for (const t of tokens) {
      const val = stateMap[t.circuitState] ?? 0;
      const orgHash = t.organizationId.slice(0, 8);
      lines.push(`circuit_breaker_state{org="${orgHash}",platform="${t.platform}",account="${t.accountLabel}"} ${val}`);
    }
  } catch {
    lines.push("# circuit_breaker_state unavailable");
  }

  // ── active_warming_sessions (gauge) ────────────────────────────
  try {
    const warmingCount = await db.orgPlatformToken.count({
      where: { warmupStatus: "WARMING" },
    });

    lines.push("# HELP active_warming_sessions Number of accounts currently in warming state");
    lines.push("# TYPE active_warming_sessions gauge");
    lines.push(`active_warming_sessions ${warmingCount}`);
  } catch {
    lines.push("# active_warming_sessions unavailable");
  }

  // ── llm_spend_cents (gauge per org) ────────────────────────────
  try {
    const today = new Date().toISOString().slice(0, 10);
    const pattern = `llm:spend:*:${today}`;
    const keys = await redis.keys(pattern);

    lines.push("# HELP llm_spend_cents Daily LLM spend in cents per org");
    lines.push("# TYPE llm_spend_cents gauge");

    if (keys.length > 0) {
      const values = await redis.mget(...keys);
      for (let i = 0; i < keys.length; i++) {
        // key format: llm:spend:{orgId}:{date}
        const orgId = keys[i].split(":")[2];
        const orgHash = orgId.slice(0, 8);
        const hundredths = Number(values[i] ?? 0);
        const cents = Math.round(hundredths / 100);
        lines.push(`llm_spend_cents{org="${orgHash}"} ${cents}`);
      }
    }
  } catch {
    lines.push("# llm_spend_cents unavailable");
  }

  // ── post_attempts_total (counter by platform+status) ───────────
  try {
    const postGroups = await db.postRecord.groupBy({
      by: ["platform", "status"],
      _count: { id: true },
    });

    lines.push("# HELP post_attempts_total Total post attempts by platform and status");
    lines.push("# TYPE post_attempts_total counter");
    for (const g of postGroups) {
      lines.push(
        `post_attempts_total{platform="${g.platform}",status="${g.status}"} ${g._count.id}`,
      );
    }
  } catch {
    lines.push("# post_attempts_total unavailable");
  }

  // ── workflow_runs_total (counter by state) ────────────────────
  try {
    const workflowRows = await db.$queryRaw<
      { state: string; count: bigint }[]
    >`
      SELECT state::text, count(*)::bigint AS count
      FROM pgboss.job
      WHERE name IN ('content-publish', 'content-schedule')
      GROUP BY state
    `;

    lines.push("# HELP workflow_runs_total Total workflow runs by status");
    lines.push("# TYPE workflow_runs_total counter");
    for (const r of workflowRows) {
      lines.push(`workflow_runs_total{status="${r.state}"} ${r.count}`);
    }
  } catch {
    lines.push("# workflow_runs_total unavailable");
  }

  // ── scrape_tasks_total (counter) ──────────────────────────────
  try {
    const scrapeRows = await db.$queryRaw<
      { state: string; count: bigint }[]
    >`
      SELECT state::text, count(*)::bigint AS count
      FROM pgboss.job
      WHERE name = 'scraper-run'
      GROUP BY state
    `;

    lines.push("# HELP scrape_tasks_total Total scrape tasks by state");
    lines.push("# TYPE scrape_tasks_total counter");
    for (const r of scrapeRows) {
      lines.push(`scrape_tasks_total{state="${r.state}"} ${r.count}`);
    }
  } catch {
    lines.push("# scrape_tasks_total unavailable");
  }

  // ── agent_calls_total (counter by agent_id) ──────────────────
  try {
    const agentRows = await db.$queryRaw<
      { agent_id: string; count: bigint }[]
    >`
      SELECT data->>'agentId' AS agent_id, count(*)::bigint AS count
      FROM pgboss.job
      WHERE name = 'agent-execute' AND state = 'completed'
      GROUP BY data->>'agentId'
    `;

    lines.push("# HELP agent_calls_total Total agent executions by agent ID");
    lines.push("# TYPE agent_calls_total counter");
    for (const r of agentRows) {
      lines.push(`agent_calls_total{agent_id="${r.agent_id}"} ${r.count}`);
    }
  } catch {
    lines.push("# agent_calls_total unavailable");
  }

  // ── queue_depth (gauge per queue) ─────────────────────────────
  try {
    const depthRows = await db.$queryRaw<
      { name: string; depth: bigint }[]
    >`
      SELECT name, count(*)::bigint AS depth
      FROM pgboss.job
      WHERE state IN ('created', 'active', 'retry')
        AND name IN (
          'content-publish', 'content-schedule', 'scraper-run',
          'media-process', 'agent-execute', 'analytics-sync', 'webhook-dispatch'
        )
      GROUP BY name
    `;

    lines.push("# HELP queue_depth Current queue depth per job type");
    lines.push("# TYPE queue_depth gauge");
    for (const r of depthRows) {
      lines.push(`queue_depth{queue="${r.name}"} ${r.depth}`);
    }
  } catch {
    lines.push("# queue_depth unavailable");
  }

  const body = lines.join("\n") + "\n";

  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
