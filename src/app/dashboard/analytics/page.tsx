"use client";

import Link from "next/link";
import { api } from "@/lib/trpc-client";
import { Badge, Button, Skeleton, SkeletonCard, useToast } from "@/components/ui/index";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AnalyticsPage() {
  const utils = api.useUtils();
  const { toast } = useToast();
  const health = api.dashboard.getAccountHealth.useQuery();
  const posts = api.dashboard.getRecentPosts.useQuery();
  const sync = api.analytics.triggerSync.useMutation({
    onSuccess: () => {
      void utils.dashboard.getAccountHealth.invalidate();
      void utils.dashboard.getRecentPosts.invalidate();
      toast("Analytics sync queued", { type: "success" });
    },
    onError: (err) => toast(err.message, { type: "error" }),
  });

  const isLoading = health.isLoading || posts.isLoading;
  const hasAccounts = health.data && health.data.length > 0;

  // Compute aggregate health
  const avgHealth = hasAccounts
    ? health.data!.reduce((sum, a) => sum + a.healthScore, 0) /
      health.data!.length
    : 0;

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-10 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">
              Your Performance
            </h1>
            <p className="mt-2 text-lg text-[var(--text-muted)]">
              See how your accounts are performing across all platforms
            </p>
          </div>
          <Button
            loading={sync.isPending}
            loadingText="Syncing…"
            onClick={() => {
              sync.reset();
              sync.mutate();
            }}
          >
            Sync Now
          </Button>
        </div>
        {isLoading ? (
          <div className="space-y-6">
            <SkeletonCard className="p-10" />
            <div className="grid grid-cols-2 gap-6">
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <SkeletonCard />
          </div>
        ) : !hasAccounts ? (
          /* Actionable empty state */
          <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] p-16 text-center">
            <svg
              className="mx-auto h-16 w-16 text-[var(--text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
              Connect your accounts to see analytics
            </h3>
            <p className="mt-2 text-[var(--text-muted)]">
              Link your social accounts in Settings to start tracking
              performance
            </p>
            <Link
              href="/dashboard/settings/connections"
              className="mt-6 inline-block rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
            >
              Connect Accounts
            </Link>
          </div>
        ) : (
          <>
            {/* Account Health Overview — Hero */}
            <div className="mb-8 rounded-xl border border-[var(--card-border)] bg-gradient-to-br from-indigo-600 to-purple-700 p-10 text-white shadow-lg">
              <p className="text-sm font-medium uppercase tracking-wide text-indigo-200">
                Account Health Overview
              </p>
              <p className="mt-2 text-5xl font-extrabold">
                {(avgHealth * 100).toFixed(0)}%
              </p>
              <p className="mt-1 text-indigo-200">
                Average health across {health.data!.length} connected account
                {health.data!.length !== 1 && "s"}
              </p>
            </div>

            {/* Per-Account Health Cards */}
            <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
              Account Health
            </h2>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {health.data!.map((account) => (
                <div
                  key={account.id}
                  className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Badge colorMap="platform" value={account.platform} />
                    <Badge colorMap="circuit" value={account.circuitState} />
                  </div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {account.accountLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {account.accountType}
                  </p>
                  {/* Health bar */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all duration-700"
                        style={{
                          width: `${account.healthScore * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {(account.healthScore * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Performance */}
            <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
              Recent Posts
            </h2>
            {posts.data?.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {posts.data.map((post: any) => (
                  <div
                    key={post.id}
                    className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <Badge colorMap="platform" value={post.platform} />
                      <span className="text-xs text-[var(--text-muted)]">
                        {post.publishedAt
                          ? new Date(post.publishedAt).toLocaleDateString()
                          : "Scheduled"}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium text-[var(--text-primary)]">
                      {post.title || "Untitled"}
                    </p>
                    <div className="mt-2">
                      <Badge colorMap="status" value={post.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[var(--text-muted)]">
                No recent posts to display.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
