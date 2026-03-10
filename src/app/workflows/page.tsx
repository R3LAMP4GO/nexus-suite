"use client";

import { api } from "@/lib/trpc-client";
import { Badge, SkeletonCard, Skeleton } from "@/components/ui/index";

export default function WorkflowsPage() {
  const { data: workflows, isLoading: loadingWorkflows } =
    api.workflows.list.useQuery();

  const { data: history, isLoading: loadingHistory } =
    api.workflows.runHistory.useQuery({ limit: 25 });

  const runNow = api.workflows.runNow.useMutation();

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Workflows</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Manage and run your content workflows
          </p>
        </div>

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
                <div
                  key={wf.name}
                  className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm"
                >
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
              ))}
            </div>
          )}
          {runNow.error && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {runNow.error.message}
            </div>
          )}
          {runNow.isSuccess && (
            <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              Queued &ldquo;{runNow.data.workflowName}&rdquo; successfully
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
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Scheduled</th>
                    <th className="px-4 py-3">Posted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {history.records.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2">
                        <Badge colorMap="status" value={r.status} />
                      </td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">
                        {r.platform}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {new Date(r.scheduledAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {r.postedAt
                          ? new Date(r.postedAt).toLocaleString()
                          : "—"}
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
