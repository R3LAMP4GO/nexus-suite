"use client";

import Link from "next/link";
import { api } from "@/lib/trpc-client";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Badge, Skeleton, SkeletonCard } from "@/components/ui/index";
import {
  Upload,
  GitBranch,
  Eye,
  BarChart3,
  AlertCircle,
} from "@/components/icons";

/* ── Helpers ────────────────────────────────────────────────── */

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ErrorCard({ error, retry }: { error: unknown; retry?: () => void }) {
  const message =
    (error as any)?.message ?? "Something went wrong loading this section.";
  const isAuth =
    message.includes("logged in") || message.includes("subscription") || message.includes("provisioned");

  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
      <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
      <div className="flex-1">
        <p className="text-sm text-red-700 dark:text-red-400">
          {isAuth ? message : "Failed to load data"}
        </p>
        {isAuth && (
          <Link
            href="/login"
            className="mt-1 inline-block text-xs font-medium text-red-600 underline hover:text-red-800 dark:text-red-400"
          >
            Sign in →
          </Link>
        )}
      </div>
      {retry && !isAuth && (
        <button
          onClick={retry}
          className="shrink-0 rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/40"
        >
          Retry
        </button>
      )}
    </div>
  );
}

const SPEND_COLORS: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

type RecentPost = {
  id: string;
  platform: string;
  title: string;
  status: string;
  publishedAt: Date | null;
};

const recentPostColumns: ColumnDef<RecentPost>[] = [
  { accessorKey: "title", header: "Title" },
  {
    accessorKey: "platform",
    header: "Platform",
    cell: (row) => <Badge colorMap="platform" value={row.platform} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (row) => <Badge colorMap="status" value={row.status} />,
  },
];

/* ── Quick Actions ──────────────────────────────────────────── */

const QUICK_ACTIONS = [
  { label: "Upload Video", href: "/dashboard/upload", icon: Upload, color: "text-indigo-500" },
  { label: "Run Workflow", href: "/workflows", icon: GitBranch, color: "text-emerald-500" },
  { label: "Track Competitor", href: "/competitors", icon: Eye, color: "text-orange-500" },
  { label: "View Analytics", href: "/dashboard/analytics", icon: BarChart3, color: "text-purple-500" },
] as const;

/* ── Page ───────────────────────────────────────────────────── */

export default function DashboardPage() {
  const workflows = api.dashboard.getWorkflowStats.useQuery();
  const spend = api.dashboard.getSpendSummary.useQuery();
  const posts = api.dashboard.getRecentPosts.useQuery();
  const health = api.dashboard.getAccountHealth.useQuery();

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        {/* Hero Greeting */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            {getGreeting()} 👋
          </h1>
          <p className="mt-1 text-[var(--text-muted)]">
            Here&apos;s what&apos;s happening with your content today
          </p>
        </div>

        {/* Quick Actions */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_ACTIONS.map((action) => {
            const ActionIcon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm transition hover:shadow-md hover:border-[var(--border-hover)]"
              >
                <div className="rounded-lg bg-[var(--bg-tertiary)] p-2 transition group-hover:scale-110">
                  <ActionIcon className={`h-5 w-5 ${action.color}`} />
                </div>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Workflow Stats */}
        {workflows.error ? (
          <div className="mb-8">
            <ErrorCard error={workflows.error} retry={() => workflows.refetch()} />
          </div>
        ) : (
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {(["active", "completed", "failed", "queued"] as const).map((key) => (
              <div
                key={key}
                className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm"
              >
                <p className="text-sm font-medium capitalize text-[var(--text-muted)]">
                  {key}
                </p>
                {workflows.isLoading ? (
                  <Skeleton className="mt-1 h-8 w-16" />
                ) : (
                  <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                    {workflows.data?.[key] ?? 0}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* LLM Spend Bar */}
        <div className="mb-8 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
            LLM Spend (Today)
          </h2>
          {spend.error ? (
            <ErrorCard error={spend.error} retry={() => spend.refetch()} />
          ) : spend.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-48" />
            </div>
          ) : spend.data ? (
            <>
              <div className="mb-2 flex justify-between text-sm text-[var(--text-muted)]">
                <span>${(spend.data.spentCents / 100).toFixed(2)} spent</span>
                <span>${(spend.data.budgetCents / 100).toFixed(2)} budget</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                <div
                  className={`h-full rounded-full transition-all ${SPEND_COLORS[spend.data.status] ?? "bg-gray-400"}`}
                  style={{
                    width: `${Math.min(spend.data.percentUsed, 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {spend.data.percentUsed.toFixed(1)}% used — $
                {(spend.data.remainingCents / 100).toFixed(2)} remaining
              </p>
            </>
          ) : null}
        </div>

        {/* Account Health Grid */}
        <div className="mb-8 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
            Account Health
          </h2>
          {health.error ? (
            <ErrorCard error={health.error} retry={() => health.refetch()} />
          ) : health.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : !health.data?.length ? (
            <p className="text-[var(--text-muted)]">
              No platform accounts connected
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {health.data.map((token) => (
                <div
                  key={token.id}
                  className="rounded-md border border-[var(--border)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {token.platform} — {token.accountLabel}
                    </span>
                    <Badge colorMap="circuit" value={token.circuitState} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: `${token.healthScore * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">
                      {(token.healthScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {token.accountType} · Failures:{" "}
                    {token.consecutiveFailures}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Posts */}
        <div className="mb-8 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
            Recent Posts
          </h2>
          {posts.error ? (
            <ErrorCard error={posts.error} retry={() => posts.refetch()} />
          ) : (
            <DataTable
              columns={recentPostColumns}
              data={posts.data ?? []}
              isLoading={posts.isLoading}
              emptyMessage="No posts yet"
            />
          )}
        </div>

        {/* Recent Activity */}
        {posts.data && posts.data.length > 0 && (
          <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
              Recent Activity
            </h2>
            <div className="space-y-3">
              {posts.data.slice(0, 5).map((post: any) => (
                <div
                  key={post.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3"
                >
                  <Badge colorMap="platform" value={post.platform} />
                  <span className="flex-1 truncate text-sm font-medium text-[var(--text-primary)]">
                    {post.title || "Untitled"}
                  </span>
                  <Badge colorMap="status" value={post.status} />
                  <span className="text-xs text-[var(--text-muted)]">
                    {timeAgo(post.publishedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
