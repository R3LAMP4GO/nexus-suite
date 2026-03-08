import { createTRPCRouter, onboardedProcedure } from "../trpc";
import { db } from "@/lib/db";
import { getSpendSummary } from "@/server/services/llm-budget";

// ── Helpers ──────────────────────────────────────────────────────

function monthlyPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

type CountMetric = "accounts" | "workflow_runs" | "videos";

const METRIC_TO_GATE: Record<CountMetric, "maxAccounts" | "maxWorkflowRuns" | "maxVideosPerMonth"> = {
  accounts: "maxAccounts",
  workflow_runs: "maxWorkflowRuns",
  videos: "maxVideosPerMonth",
};

const METRICS: CountMetric[] = ["accounts", "workflow_runs", "videos"];

// ── Router ───────────────────────────────────────────────────────

export const usageRouter = createTRPCRouter({
  getUsageSummary: onboardedProcedure.query(async ({ ctx }) => {
    const orgId = ctx.organizationId;
    const period = monthlyPeriod();

    const [records, org] = await Promise.all([
      db.usageRecord.findMany({
        where: { organizationId: orgId, period, metric: { in: METRICS } },
        select: { metric: true, count: true },
      }),
      db.organization.findUnique({
        where: { id: orgId },
        select: { maxAccounts: true, maxWorkflowRuns: true, maxVideosPerMonth: true },
      }),
    ]);

    const countMap = new Map(records.map((r) => [r.metric, r.count]));

    return METRICS.map((metric) => {
      const current = countMap.get(metric) ?? 0;
      const limit = (org?.[METRIC_TO_GATE[metric]] as number) ?? 0;
      const percentUsed = limit > 0 ? Math.round((current / limit) * 100) : 0;
      return { metric, current, limit, percentUsed };
    });
  }),

  getLlmSpend: onboardedProcedure.query(async ({ ctx }) => {
    const orgId = ctx.organizationId;

    // Last 30 daily periods
    const dates: string[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const [records, liveSummary] = await Promise.all([
      db.usageRecord.findMany({
        where: {
          organizationId: orgId,
          metric: "llm_spend_cents",
          period: { in: dates },
        },
        select: { period: true, count: true },
        orderBy: { period: "asc" },
      }),
      getSpendSummary(orgId),
    ]);

    const spendMap = new Map(records.map((r) => [r.period, r.count]));

    const history = dates.map((date) => ({
      date,
      spentCents: spendMap.get(date) ?? 0,
    }));

    return { history, today: liveSummary };
  }),
});
