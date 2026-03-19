"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/trpc-client";
import { Badge, Skeleton } from "@/components/ui/index";
import { useState } from "react";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

interface StepData {
  stepId: string;
  status: "success" | "error" | "skipped";
  output?: unknown;
  error?: string;
  durationMs: number;
}

function StepCard({ step }: { step: StepData }) {
  const [expanded, setExpanded] = useState(false);
  const outputStr =
    step.output != null
      ? typeof step.output === "string"
        ? step.output
        : JSON.stringify(step.output, null, 2)
      : null;
  const truncated = outputStr && outputStr.length > 200;

  return (
    <div
      className={`rounded-lg border p-4 ${
        step.status === "error"
          ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/10"
          : step.status === "skipped"
            ? "border-[var(--border)] bg-[var(--bg-tertiary)] opacity-60"
            : "border-[var(--card-border)] bg-[var(--card-bg)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-[var(--text-primary)]">
            {step.stepId}
          </span>
          <Badge
            colorMap="status"
            value={step.status === "success" ? "SUCCESS" : step.status === "error" ? "FAILED" : "SKIPPED"}
          />
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {formatDuration(step.durationMs)}
        </span>
      </div>

      {step.error && (
        <div className="mt-2 rounded-md bg-red-100 p-2 text-xs text-red-800 dark:bg-red-900/20 dark:text-red-400">
          {step.error}
        </div>
      )}

      {outputStr && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            {expanded ? "▲ Hide output" : "▼ Show output"}
          </button>
          {expanded && (
            <pre className="mt-1 max-h-96 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3 text-xs text-[var(--text-secondary)]">
              {outputStr}
            </pre>
          )}
          {!expanded && truncated && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {outputStr.slice(0, 200)}…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkflowRunPage() {
  const params = useParams();
  const runId = params.runId as string;

  const { data: run, isLoading, isError, error } = api.workflows.getRunDetails.useQuery(
    { runId },
    { enabled: !!runId },
  );

  if (isLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/workflows"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            ← Back to Workflows
          </Link>
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <p className="font-medium text-red-700 dark:text-red-400">
              Failed to load workflow run
            </p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {error.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--text-muted)]">Workflow run not found.</p>
      </div>
    );
  }

  const steps = (run.steps as unknown as StepData[]) ?? [];

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/workflows"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            ← Back to Workflows
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {run.workflowName}
            </h1>
            <Badge
              colorMap="status"
              value={run.status === "completed" ? "SUCCESS" : run.status === "failed" ? "FAILED" : "SKIPPED"}
            />
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-[var(--text-muted)]">
            <span>Run: {run.runId.slice(0, 8)}…</span>
            <span>Duration: {formatDuration(run.durationMs)}</span>
            <span>
              {new Date(run.startedAt).toLocaleString()}
            </span>
          </div>
          {run.error && (
            <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {run.error}
            </div>
          )}
        </div>

        {/* Step Timeline */}
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
          Steps ({steps.length})
        </h2>
        <div className="space-y-3">
          {steps.map((step, i) => (
            <StepCard key={`${step.stepId}-${i}`} step={step} />
          ))}
        </div>

        {/* Variables */}
        {run.variables && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
              Final Variables
            </h2>
            <pre className="max-h-96 overflow-auto rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4 text-xs text-[var(--text-secondary)]">
              {JSON.stringify(run.variables, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
