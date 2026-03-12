"use client";

import { useState } from "react";
import { api } from "@/lib/trpc-client";
import {
  Badge,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/index";
import {
  GitBranch,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from "@/components/icons";

/* ── Types ───────────────────────────────────────────────────── */

type WorkflowRun = {
  id: string;
  workflowName: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  error: string | null;
  triggeredBy: string | null;
  _count: { steps: number };
};

type WorkflowStep = {
  id: string;
  runId: string;
  stepName: string;
  stepType: string | null;
  agentId: string | null;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  durationMs: number | null;
  tokenUsage: unknown;
  startedAt: Date;
  completedAt: Date | null;
};

/* ── Constants ───────────────────────────────────────────────── */

const STATUS_BADGE: Record<string, { variant: "info" | "success" | "danger" | "default" | "warning" }> = {
  RUNNING: { variant: "info" },
  COMPLETED: { variant: "success" },
  FAILED: { variant: "danger" },
  CANCELLED: { variant: "default" },
  SKIPPED: { variant: "warning" },
};

const TAB_FILTERS: { label: string; value: string; status?: string }[] = [
  { label: "All Runs", value: "all" },
  { label: "Running", value: "RUNNING", status: "RUNNING" },
  { label: "Completed", value: "COMPLETED", status: "COMPLETED" },
  { label: "Failed", value: "FAILED", status: "FAILED" },
];

/* ── Helpers ─────────────────────────────────────────────────── */

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { variant: "default" as const };
  return <Badge variant={cfg.variant}>{status}</Badge>;
}

/* ── Collapsible JSON View ───────────────────────────────────── */

function CollapsibleJson({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);

  if (data == null) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {label}
      </button>
      {open && (
        <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-xs text-[var(--text-secondary)]">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ── Step Row ────────────────────────────────────────────────── */

function StepRow({ step }: { step: WorkflowStep }) {
  const tokenUsage = step.tokenUsage as { prompt?: number; completion?: number; total?: number } | null;

  return (
    <div className="relative border-l-2 border-[var(--border)] pl-6 pb-4 last:pb-0">
      {/* Timeline dot */}
      <div
        className={`absolute -left-[5px] top-1 h-2 w-2 rounded-full ${
          step.status === "COMPLETED"
            ? "bg-green-500"
            : step.status === "FAILED"
              ? "bg-red-500"
              : step.status === "RUNNING"
                ? "bg-blue-500"
                : step.status === "SKIPPED"
                  ? "bg-yellow-500"
                  : "bg-gray-500"
        }`}
      />

      <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3">
        {/* Step header */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {step.stepName}
          </span>
          <StatusBadge status={step.status} />
          {step.stepType && (
            <span className="text-xs text-[var(--text-muted)]">
              {step.stepType}
            </span>
          )}
          {step.agentId && (
            <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
              {step.agentId}
            </span>
          )}
        </div>

        {/* Step meta */}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>{formatDuration(step.durationMs)}</span>
          {tokenUsage?.total != null && (
            <span>{tokenUsage.total.toLocaleString()} tokens</span>
          )}
          {tokenUsage?.prompt != null && tokenUsage?.completion != null && (
            <span className="text-[var(--text-muted)]">
              ({tokenUsage.prompt.toLocaleString()}p / {tokenUsage.completion.toLocaleString()}c)
            </span>
          )}
        </div>

        {/* Error */}
        {step.error && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
            <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <span className="break-all">{step.error}</span>
          </div>
        )}

        {/* Input / Output */}
        <CollapsibleJson label="Input" data={step.input} />
        <CollapsibleJson label="Output" data={step.output} />
      </div>
    </div>
  );
}

/* ── Run Detail Panel ────────────────────────────────────────── */

function RunDetail({ runId }: { runId: string }) {
  const detail = api.workflows.getRunDetail.useQuery({ runId });

  if (detail.isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3"
          >
            <Skeleton className="h-2 w-2 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (detail.error) {
    return (
      <div className="p-4 text-sm text-red-400">
        Failed to load run details: {detail.error.message}
      </div>
    );
  }

  const run = detail.data!;
  const steps = run.steps as WorkflowStep[];

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-tertiary)] p-4">
      {/* Run error */}
      {run.error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="break-all">{run.error}</span>
        </div>
      )}

      {/* Steps timeline */}
      {steps.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No steps recorded.</p>
      ) : (
        <div className="ml-1">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Run Row ─────────────────────────────────────────────────── */

function RunRow({
  run,
  expanded,
  onToggle,
}: {
  run: WorkflowRun;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm transition hover:border-[var(--border-hover)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        {/* Expand icon */}
        <div className="text-[var(--text-muted)]">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>

        {/* Icon */}
        <div className="rounded-lg bg-[var(--bg-tertiary)] p-2">
          <GitBranch className="h-5 w-5 text-indigo-500" />
        </div>

        {/* Name + date */}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
            {run.workflowName}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
            {formatDate(run.startedAt)}
          </span>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)]">
            {run._count.steps} step{run._count.steps !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {formatDuration(run.durationMs)}
          </span>
          <StatusBadge status={run.status} />
        </div>
      </button>

      {expanded && <RunDetail runId={run.id} />}
    </div>
  );
}

/* ── Loading Skeleton ────────────────────────────────────────── */

function RunListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm"
        >
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ── Empty State ─────────────────────────────────────────────── */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] p-16 text-center">
      <GitBranch className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
      <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">
        {message}
      </h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Workflow runs will appear here once your agents execute workflows.
      </p>
    </div>
  );
}

/* ── Run List (per-tab) ──────────────────────────────────────── */

function RunList({ status }: { status?: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const runs = api.workflows.listRuns.useQuery(
    status ? { status } : undefined,
  );

  if (runs.isLoading) return <RunListSkeleton />;

  if (!runs.data?.runs.length) {
    const msg = status
      ? `No ${status.toLowerCase()} runs`
      : "No workflow runs yet";
    return <EmptyState message={msg} />;
  }

  return (
    <div className="space-y-3">
      {runs.data.runs.map((run: WorkflowRun) => (
        <RunRow
          key={run.id}
          run={run}
          expanded={expandedId === run.id}
          onToggle={() =>
            setExpandedId(expandedId === run.id ? null : run.id)
          }
        />
      ))}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

export default function WorkflowsPage() {
  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Workflow Runs
          </h1>
          <p className="mt-1 text-[var(--text-muted)]">
            Inspect workflow executions and step-by-step agent activity
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all">
          <TabsList>
            {TAB_FILTERS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TAB_FILTERS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <RunList status={tab.status} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
