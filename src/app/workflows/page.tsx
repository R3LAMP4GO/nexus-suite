"use client";

import { useState } from "react";
import { api } from "@/lib/trpc-client";
import Link from "next/link";
import { Badge, SkeletonCard, Skeleton, useToast } from "@/components/ui/index";
import { WorkflowCreateModal } from "@/components/workflows/workflow-create-modal";

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = Math.round(secs % 60);
  return `${mins}m ${remSecs}s`;
}

type WorkflowDef = {
  name: string;
  description?: string;
  trigger: { type: string; schedule?: string };
};

function WorkflowCard({ wf }: { wf: WorkflowDef }) {
  const utils = api.useUtils();
  const { toast } = useToast();
  const runNow = api.workflows.runNow.useMutation({
    onSuccess: () => {
      void utils.workflows.runHistory.invalidate();
      toast("Workflow queued", { type: "success" });
    },
    onError: (err) => toast(err.message, { type: "error" }),
  });

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-[var(--text-primary)]">
            {wf.name}
          </h3>
          {wf.description && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {wf.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Badge variant="default">{wf.trigger.type}</Badge>
            {wf.trigger.schedule && (
              <span className="font-mono">
                {wf.trigger.schedule}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={() => {
          runNow.reset();
          runNow.mutate({ workflowName: wf.name });
        }}
        disabled={runNow.isPending}
        className="mt-3 w-full rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
      >
        {runNow.isPending ? "Queuing..." : "Run Now"}
      </button>
    </div>
  );
}

export default function WorkflowsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const utils = api.useUtils();
  const { toast } = useToast();

  const { data: workflows, isLoading: loadingWorkflows } =
    api.workflows.list.useQuery();

  const { data: history, isLoading: loadingHistory } =
    api.workflows.runHistory.useQuery({ limit: 25 });

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Workflows</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Manage and run your content workflows
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Create Workflow
          </button>
        </div>

        <WorkflowCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { void utils.workflows.list.invalidate(); toast("Workflow created", { type: "success" }); }}
        />

        {/* Workflow Definitions */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
            Workflow Definitions
          </h2>
          {loadingWorkflows ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : !workflows?.length ? (
            <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] py-8 text-center text-[var(--text-muted)]">
              No workflows found. Add YAML files to your workflows directory.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workflows.map((wf) => (
                <WorkflowCard key={wf.name} wf={wf} />
              ))}
            </div>
          )}
        </section>

        {/* Run History */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
            Run History
          </h2>
          {loadingHistory ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !history?.records.length ? (
            <div className="py-8 text-center text-[var(--text-muted)]">
              No run history yet.
            </div>
          ) : (
            <div className="overflow-x-auto overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--bg-tertiary)] text-xs uppercase text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Workflow</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Completed</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {history.records.map((r: Record<string, unknown>) => (
                    <tr key={r.id as string}>
                      <td className="px-4 py-2">
                        <Badge colorMap="status" value={(r.status as string).toUpperCase()} />
                      </td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">
                        <Link
                          href={`/workflows/${(r.runId as string) || (r.id as string)}`}
                          className="hover:text-[var(--accent)] hover:underline"
                        >
                          {r.workflowName as string}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {r.startedAt
                          ? new Date(r.startedAt as string).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {r.completedAt
                          ? new Date(r.completedAt as string).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {formatDuration(r.durationMs as number | null)}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-[var(--text-muted)]" title={(r.error as string) ?? ""}>
                        {r.error ? (
                          <span className="text-red-600 dark:text-red-400">{r.error as string}</span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
