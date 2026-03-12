"use client";

import { api } from "@/lib/trpc-client";
import { Badge, Skeleton, SkeletonCard } from "@/components/ui/index";
import { Bot } from "@/components/icons";

/* ── Helpers ────────────────────────────────────────────────── */

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

function timeAgo(date: string | null): string {
  if (!date) return "Never";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function successRateVariant(rate: number): "success" | "warning" | "danger" {
  if (rate >= 0.9) return "success";
  if (rate >= 0.7) return "warning";
  return "danger";
}

/* ── Page ───────────────────────────────────────────────────── */

export default function AgentObservabilityPage() {
  const stats = api.agents.stats.useQuery();

  const data = stats.data ?? [];
  const totalCalls = data.reduce((s, a) => s + a.totalRuns, 0);
  const totalCompleted = data.reduce((s, a) => s + a.completedRuns, 0);
  const overallSuccessRate = totalCalls > 0 ? totalCompleted / totalCalls : 0;
  const totalTokens = data.reduce((s, a) => s + a.totalTokens, 0);

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Agent Observability
          </h1>
          <p className="mt-1 text-[var(--text-muted)]">
            Monitor agent performance, success rates, and token usage
          </p>
        </div>

        {stats.isLoading ? (
          <div className="space-y-6">
            {/* Summary skeleton */}
            <div className="grid grid-cols-3 gap-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            {/* Table skeleton */}
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
              <Skeleton className="mb-4 h-5 w-48" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </div>
          </div>
        ) : data.length === 0 ? (
          /* Empty state */
          <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] p-16 text-center">
            <Bot className="mx-auto h-16 w-16 text-[var(--text-muted)]" />
            <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
              No agent activity yet
            </h3>
            <p className="mt-2 text-[var(--text-muted)]">
              Agent stats will appear here once workflows run agent steps
            </p>
          </div>
        ) : (
          <>
            {/* Summary Bar */}
            <div className="mb-8 grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  Total Agent Calls
                </p>
                <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
                  {formatNumber(totalCalls)}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  Overall Success Rate
                </p>
                <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
                  {(overallSuccessRate * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
                <p className="text-sm font-medium text-[var(--text-muted)]">
                  Total Tokens Used
                </p>
                <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
                  {formatNumber(totalTokens)}
                </p>
              </div>
            </div>

            {/* Agent Table */}
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--card-border)]">
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Agent
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Invocations
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Success Rate
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Avg Duration
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Total Tokens
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Last Invoked
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((agent) => (
                      <tr
                        key={agent.agentId}
                        className="border-b border-[var(--card-border)] last:border-b-0 transition hover:bg-[var(--bg-tertiary)]"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4 text-[var(--text-muted)]" />
                            <span className="font-medium text-[var(--text-primary)]">
                              {agent.agentId}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-[var(--text-primary)]">
                          {formatNumber(agent.totalRuns)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Badge variant={successRateVariant(agent.successRate)}>
                            {(agent.successRate * 100).toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-[var(--text-primary)]">
                          {formatDuration(agent.avgDurationMs)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-[var(--text-primary)]">
                          {formatNumber(agent.totalTokens)}
                        </td>
                        <td className="px-6 py-4 text-right text-[var(--text-muted)]">
                          {timeAgo(agent.lastRunAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
