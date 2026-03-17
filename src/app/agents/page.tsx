"use client";

import { useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc-client";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  AgentHierarchyTree,
  type AgentEntry,
} from "@/components/agents/agent-hierarchy-tree";

export default function AgentsPage() {
  const {
    data: agents,
    isLoading: agentsLoading,
    error: agentsError,
  } = api.agents.list.useQuery();
  const { data: stats, isLoading: statsLoading } = api.agents.stats.useQuery(
    undefined,
    { retry: 1 },
  );

  // Only block on the agent list loading — stats are supplementary
  const isLoading = agentsLoading;

  const mergedAgents: AgentEntry[] = useMemo(() => {
    if (!agents) return [];

    // Build a lookup from stats by agentId (may be unavailable)
    const statsMap = new Map(
      (stats ?? []).map((s) => [
        s.agentId,
        {
          totalRuns: s.totalRuns,
          successRate: s.successRate * 100,
          avgDuration: s.avgDurationMs,
          tokenUsage: s.totalTokens,
          lastRunAt: s.lastRunAt ? new Date(s.lastRunAt) : null,
        },
      ]),
    );

    return agents.map((agent) => ({
      name: agent.name,
      tier: agent.tier as 1 | 2 | 3,
      toolCount: agent.toolCount,
      stats: statsMap.get(agent.name),
    }));
  }, [agents, stats]);

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Agents
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              All registered agents in the Mastra hierarchy
            </p>
          </div>
          <Link
            href="/dashboard/studio"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            Chat in Studio →
          </Link>
        </div>

        {/* Error state */}
        {agentsError && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm font-medium text-red-400">
              Failed to load agents
            </p>
            <p className="mt-1 text-xs text-red-400/80">
              {agentsError.message}
            </p>
          </div>
        )}

        {/* Stats loading indicator (non-blocking) */}
        {!agentsLoading && statsLoading && mergedAgents.length > 0 && (
          <p className="mb-4 text-xs text-[var(--text-muted)] animate-pulse">
            Loading agent statistics…
          </p>
        )}

        {/* Hierarchy tree */}
        {isLoading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((tier) => (
              <div
                key={tier}
                className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-5"
              >
                <div className="mb-4 h-6 w-48 animate-pulse rounded bg-[var(--bg-secondary)]" />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              </div>
            ))}
          </div>
        ) : !mergedAgents.length && !agentsError ? (
          <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] py-12 text-center text-[var(--text-muted)]">
            No agents registered. The agent registry may not have been
            initialized — try restarting the dev server.
          </div>
        ) : mergedAgents.length > 0 ? (
          <AgentHierarchyTree agents={mergedAgents} />
        ) : null}
      </div>
    </div>
  );
}
