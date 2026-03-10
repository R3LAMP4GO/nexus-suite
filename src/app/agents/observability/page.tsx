"use client";

import { useState } from "react";
import { api } from "@/lib/trpc-client";
import { Badge, Skeleton, Button, Modal } from "@/components/ui/index";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Activity {
  agentName: string;
  stepId: string;
  status: string;
  outputPreview: string;
  durationMs: number;
  workflowName: string;
  runId: string;
  timestamp: string;
  error?: string;
}

export default function AgentObservabilityPage() {
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

  const { data: agents } = api.agents.list.useQuery();

  const { data, isLoading } = api.agents.getRecentActivity.useQuery({
    agentName: filterAgent || undefined,
    limit: 50,
  });

  const { data: diagnostics } = api.agents.getDiagnostics.useQuery({ limit: 50 });

  const activities = data?.activities ?? [];

  // Summary stats
  const totalCalls = activities.length;
  const errorCount = activities.filter((a) => a.status === "error").length;
  const avgDuration =
    totalCalls > 0
      ? Math.round(activities.reduce((sum, a) => sum + a.durationMs, 0) / totalCalls)
      : 0;

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Agent Observability
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Monitor agent activity, outputs, and performance
          </p>
        </div>

        {/* Summary Stats */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            <p className="text-sm text-[var(--text-muted)]">Total Calls</p>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{totalCalls}</p>
          </div>
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            <p className="text-sm text-[var(--text-muted)]">Avg Duration</p>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{formatDuration(avgDuration)}</p>
          </div>
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            <p className="text-sm text-[var(--text-muted)]">Error Rate</p>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
              {totalCalls > 0 ? `${((errorCount / totalCalls) * 100).toFixed(1)}%` : "0%"}
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm text-[var(--text-muted)]">Filter by agent:</label>
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--input-text)]"
          >
            <option value="">All Agents</option>
            {agents?.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Activity Table */}
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : activities.length === 0 ? (
            <p className="p-8 text-center text-[var(--text-muted)]">
              No agent activity recorded yet. Run a workflow to see results.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
                <tr>
                  <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Time</th>
                  <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Agent</th>
                  <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Workflow</th>
                  <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Output</th>
                  <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Duration</th>
                  <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {activities.map((activity, i) => (
                  <tr
                    key={`${activity.runId}-${activity.stepId}-${i}`}
                    className="cursor-pointer transition hover:bg-[var(--bg-tertiary)]"
                    onClick={() => setSelectedActivity(activity)}
                  >
                    <td className="px-4 py-2 text-xs text-[var(--text-muted)]">
                      {timeAgo(activity.timestamp)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-[var(--text-primary)]">
                      {activity.agentName}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--text-secondary)]">
                      {activity.workflowName}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-xs text-[var(--text-muted)]">
                      {activity.outputPreview || "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--text-muted)]">
                      {formatDuration(activity.durationMs)}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        colorMap="status"
                        value={activity.status === "success" ? "SUCCESS" : "FAILED"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Tool Diagnostics */}
        {diagnostics && diagnostics.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
              Recent Tool Calls
            </h2>
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
                  <tr>
                    <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Agent</th>
                    <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Tool</th>
                    <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Duration</th>
                    <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">I/O Size</th>
                    <th className="px-4 py-2 text-xs font-medium text-[var(--text-muted)]">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {diagnostics.map((d, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-mono text-xs">{d.agentName}</td>
                      <td className="px-4 py-2 font-mono text-xs">{d.toolName}</td>
                      <td className="px-4 py-2 text-xs">{d.durationMs}ms</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-muted)]">
                        {d.inputSize}→{d.outputSize}
                      </td>
                      <td className="px-4 py-2 text-xs text-red-500">
                        {d.error ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        <Modal
          open={!!selectedActivity}
          onClose={() => setSelectedActivity(null)}
          title={`Agent: ${selectedActivity?.agentName ?? ""}`}
          maxWidth="max-w-2xl"
        >
          {selectedActivity && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-[var(--text-muted)]">Workflow:</span>{" "}
                  <span className="text-[var(--text-primary)]">{selectedActivity.workflowName}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Duration:</span>{" "}
                  <span className="text-[var(--text-primary)]">{formatDuration(selectedActivity.durationMs)}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Status:</span>{" "}
                  <Badge colorMap="status" value={selectedActivity.status === "success" ? "SUCCESS" : "FAILED"} />
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Run ID:</span>{" "}
                  <span className="font-mono text-xs text-[var(--text-primary)]">{selectedActivity.runId.slice(0, 12)}…</span>
                </div>
              </div>

              {selectedActivity.error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  {selectedActivity.error}
                </div>
              )}

              <div>
                <h4 className="mb-1 text-sm font-medium text-[var(--text-primary)]">Output</h4>
                <pre className="max-h-64 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3 text-xs text-[var(--text-secondary)]">
                  {selectedActivity.outputPreview || "No output"}
                </pre>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
