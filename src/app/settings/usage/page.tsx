"use client";

import { api } from "@/lib/trpc-client";
import { Skeleton } from "@/components/ui/skeleton";

const METRIC_LABELS: Record<string, string> = {
  accounts: "Social Accounts",
  workflow_runs: "Workflow Runs",
  videos: "Videos",
};

function UsageBar({
  label,
  current,
  limit,
  percentUsed,
}: {
  label: string;
  current: number;
  limit: number;
  percentUsed: number;
}) {
  const color =
    percentUsed >= 90
      ? "bg-red-500"
      : percentUsed >= 70
        ? "bg-yellow-500"
        : "bg-blue-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="text-[var(--text-muted)]">
          {current} / {limit}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-[var(--bg-tertiary)]">
        <div
          className={`h-2.5 rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>
    </div>
  );
}

function SparkLine({ data }: { data: { date: string; spentCents: number }[] }) {
  const max = Math.max(...data.map((d) => d.spentCents), 1);
  return (
    <div className="flex items-end gap-px h-16">
      {data.map((d) => (
        <div
          key={d.date}
          className="flex-1 rounded-t bg-indigo-400 hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
          style={{
            height: `${Math.max((d.spentCents / max) * 100, 2)}%`,
          }}
          title={`${d.date}: $${(d.spentCents / 100).toFixed(2)}`}
        />
      ))}
    </div>
  );
}

const STATUS_COLORS = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
} as const;

const TIER_FEATURES = [
  {
    label: "Social Accounts",
    pro: "5",
    multiplier: "20",
    enterprise: "Unlimited",
  },
  {
    label: "Workflow Runs / mo",
    pro: "500",
    multiplier: "5,000",
    enterprise: "Unlimited",
  },
  {
    label: "Videos / mo",
    pro: "50",
    multiplier: "500",
    enterprise: "Unlimited",
  },
  {
    label: "Daily LLM Budget",
    pro: "$5",
    multiplier: "$25",
    enterprise: "Custom",
  },
  { label: "ML Features", pro: "No", multiplier: "Yes", enterprise: "Yes" },
  {
    label: "Multiplier Engine",
    pro: "No",
    multiplier: "Yes",
    enterprise: "Yes",
  },
];

export default function UsagePage() {
  const summary = api.usage.getUsageSummary.useQuery();
  const llm = api.usage.getLlmSpend.useQuery();

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Usage & Limits
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Monitor your resource consumption and plan limits
          </p>
        </div>

        {/* Usage Bars */}
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
            Resource Usage
          </h2>
          {summary.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : summary.error ? (
            <p className="text-sm text-[var(--danger)]">
              {summary.error.message}
            </p>
          ) : (
            <div className="space-y-4">
              {summary.data?.map((item) => (
                <UsageBar
                  key={item.metric}
                  label={METRIC_LABELS[item.metric] ?? item.metric}
                  current={item.current}
                  limit={item.limit}
                  percentUsed={item.percentUsed}
                />
              ))}
            </div>
          )}
        </div>

        {/* LLM Spend */}
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
            LLM Spend
          </h2>
          {llm.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : llm.error ? (
            <p className="text-sm text-[var(--danger)]">{llm.error.message}</p>
          ) : llm.data ? (
            <div className="space-y-6">
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-[var(--text-secondary)]">
                    Today&apos;s Budget
                    <span
                      className={`ml-2 inline-block h-2 w-2 rounded-full ${STATUS_COLORS[llm.data.today.status]}`}
                    />
                  </span>
                  <span className="text-[var(--text-muted)]">
                    ${(llm.data.today.spentCents / 100).toFixed(2)} / $
                    {(llm.data.today.budgetCents / 100).toFixed(2)}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[var(--bg-tertiary)]">
                  <div
                    className={`h-2.5 rounded-full ${STATUS_COLORS[llm.data.today.status]} transition-all`}
                    style={{
                      width: `${Math.min(llm.data.today.percentUsed, 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
                  Last 30 Days
                </h3>
                <SparkLine data={llm.data.history} />
                <div className="mt-1 flex justify-between text-xs text-[var(--text-muted)]">
                  <span>{llm.data.history[0]?.date}</span>
                  <span>
                    {llm.data.history[llm.data.history.length - 1]?.date}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Tier Comparison */}
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
            Plan Comparison
          </h2>
          <div className="overflow-hidden rounded-md border border-[var(--border)]">
            <table className="min-w-full divide-y divide-[var(--border)] text-sm">
              <thead className="bg-[var(--bg-tertiary)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-[var(--text-muted)]">
                    Feature
                  </th>
                  <th className="px-4 py-2 text-center font-medium text-[var(--text-muted)]">
                    Pro
                  </th>
                  <th className="px-4 py-2 text-center font-medium text-[var(--text-muted)]">
                    Multiplier
                  </th>
                  <th className="px-4 py-2 text-center font-medium text-[var(--text-muted)]">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {TIER_FEATURES.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">
                      {row.label}
                    </td>
                    <td className="px-4 py-2 text-center text-[var(--text-muted)]">
                      {row.pro}
                    </td>
                    <td className="px-4 py-2 text-center text-[var(--text-muted)]">
                      {row.multiplier}
                    </td>
                    <td className="px-4 py-2 text-center text-[var(--text-muted)]">
                      {row.enterprise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
