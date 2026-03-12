"use client";

import Link from "next/link";
import { api } from "@/lib/trpc-client";
import {
  Badge,
  Skeleton,
  SkeletonCard,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/index";

/* ── Helpers ─────────────────────────────────────────────────── */

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function GrowthIndicator({ percent }: { percent: number }) {
  if (percent === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
        — No change
      </span>
    );
  }
  const isUp = percent > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        isUp ? "text-green-500" : "text-red-500"
      }`}
    >
      <svg
        className={`h-3.5 w-3.5 ${isUp ? "" : "rotate-180"}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      </svg>
      {Math.abs(percent).toFixed(1)}%
    </span>
  );
}

const PLATFORM_LABELS: Record<string, string> = {
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  LINKEDIN: "LinkedIn",
  X: "X",
  FACEBOOK: "Facebook",
};

const PLATFORM_ICONS: Record<string, string> = {
  YOUTUBE: "🎬",
  TIKTOK: "🎵",
  INSTAGRAM: "📸",
  LINKEDIN: "💼",
  X: "𝕏",
  FACEBOOK: "📘",
};

/* ── Platform Stats Card (used in both comparison & detail) ── */

function PlatformStatsCard({
  data,
  showTopPost,
}: {
  data: {
    platform: string;
    totalPosts: number;
    successPosts: number;
    failedPosts: number;
    scheduledPosts: number;
    accountCount: number;
    avgHealth: number;
    engagementRate: number;
    growthPercent: number;
    postsLast30Days: number;
    topPost: {
      id: string;
      title: string;
      account: string;
      postedAt: Date | null;
    } | null;
  };
  showTopPost?: boolean;
}) {
  const hasData = data.totalPosts > 0 || data.accountCount > 0;

  if (!hasData) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] p-6 text-center">
        <span className="text-3xl">{PLATFORM_ICONS[data.platform]}</span>
        <h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
          {PLATFORM_LABELS[data.platform]}
        </h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          No data yet. Connect an account to start tracking.
        </p>
        <Link
          href="/dashboard/settings/connections"
          className="mt-3 inline-block text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          Connect →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{PLATFORM_ICONS[data.platform]}</span>
          <Badge colorMap="platform" value={data.platform} />
        </div>
        <GrowthIndicator percent={data.growthPercent} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-[var(--text-muted)]">Total Posts</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatNumber(data.totalPosts)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-muted)]">Last 30 Days</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatNumber(data.postsLast30Days)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-muted)]">Success Rate</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {data.engagementRate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-muted)]">Accounts</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {data.accountCount}
          </p>
        </div>
      </div>

      {/* Health Bar */}
      {data.accountCount > 0 && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">Avg Health</p>
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {(data.avgHealth * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-700"
              style={{ width: `${data.avgHealth * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Status Breakdown */}
      <div className="mt-4 flex gap-2">
        {data.successPosts > 0 && (
          <Badge variant="success">✓ {data.successPosts}</Badge>
        )}
        {data.failedPosts > 0 && (
          <Badge variant="danger">✗ {data.failedPosts}</Badge>
        )}
        {data.scheduledPosts > 0 && (
          <Badge variant="warning">⏱ {data.scheduledPosts}</Badge>
        )}
      </div>

      {/* Top Post */}
      {showTopPost && data.topPost && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            Best Performing
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-medium text-[var(--text-primary)]">
            {data.topPost.title}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            via {data.topPost.account}
            {data.topPost.postedAt &&
              ` · ${new Date(data.topPost.postedAt).toLocaleDateString()}`}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Loading Skeleton ────────────────────────────────────────── */

function PlatformsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="p-5" />
        ))}
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────── */

export default function PlatformAnalyticsPage() {
  const { data, isLoading } = api.analytics.platformBreakdown.useQuery();

  const hasAnyData = data?.some((p) => p.totalPosts > 0 || p.accountCount > 0);

  // Sort platforms: those with data first, then alphabetical
  const sorted = data
    ? [...data].sort((a, b) => {
        const aHas = a.totalPosts > 0 || a.accountCount > 0 ? 1 : 0;
        const bHas = b.totalPosts > 0 || b.accountCount > 0 ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        return a.platform.localeCompare(b.platform);
      })
    : [];

  // Aggregate totals for hero
  const totals = data
    ? {
        posts: data.reduce((s, p) => s + p.totalPosts, 0),
        success: data.reduce((s, p) => s + p.successPosts, 0),
        accounts: data.reduce((s, p) => s + p.accountCount, 0),
        activePlatforms: data.filter((p) => p.totalPosts > 0).length,
      }
    : null;

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/analytics"
              className="text-sm text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
            >
              ← Analytics
            </Link>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-[var(--text-primary)]">
            Platform Breakdown
          </h1>
          <p className="mt-2 text-lg text-[var(--text-muted)]">
            Performance metrics for each connected platform
          </p>
        </div>

        {isLoading ? (
          <PlatformsSkeleton />
        ) : !hasAnyData ? (
          /* Empty state */
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
                d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
              />
            </svg>
            <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
              No platform data yet
            </h3>
            <p className="mt-2 text-[var(--text-muted)]">
              Connect your social accounts and start posting to see per-platform
              analytics
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
            {/* Hero Totals */}
            {totals && (
              <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "Total Posts", value: formatNumber(totals.posts) },
                  {
                    label: "Successful",
                    value: formatNumber(totals.success),
                  },
                  {
                    label: "Active Platforms",
                    value: String(totals.activePlatforms),
                  },
                  {
                    label: "Connected Accounts",
                    value: String(totals.accounts),
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm"
                  >
                    <p className="text-xs text-[var(--text-muted)]">
                      {stat.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs: Comparison + Per-Platform */}
            <Tabs defaultValue="comparison">
              <TabsList>
                <TabsTrigger value="comparison">All Platforms</TabsTrigger>
                {sorted
                  .filter((p) => p.totalPosts > 0 || p.accountCount > 0)
                  .map((p) => (
                    <TabsTrigger key={p.platform} value={p.platform}>
                      {PLATFORM_ICONS[p.platform]}{" "}
                      {PLATFORM_LABELS[p.platform]}
                    </TabsTrigger>
                  ))}
              </TabsList>

              {/* Comparison View */}
              <TabsContent value="comparison">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sorted.map((p) => (
                    <PlatformStatsCard
                      key={p.platform}
                      data={p}
                      showTopPost={false}
                    />
                  ))}
                </div>
              </TabsContent>

              {/* Per-Platform Detail Views */}
              {sorted
                .filter((p) => p.totalPosts > 0 || p.accountCount > 0)
                .map((p) => (
                  <TabsContent key={p.platform} value={p.platform}>
                    <div className="space-y-6">
                      {/* Platform hero */}
                      <div className="rounded-xl border border-[var(--card-border)] bg-gradient-to-br from-indigo-600 to-purple-700 p-8 text-white shadow-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">
                            {PLATFORM_ICONS[p.platform]}
                          </span>
                          <div>
                            <h2 className="text-2xl font-bold">
                              {PLATFORM_LABELS[p.platform]}
                            </h2>
                            <p className="text-sm text-indigo-200">
                              {p.accountCount} account
                              {p.accountCount !== 1 && "s"} connected
                            </p>
                          </div>
                        </div>
                        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                          <div>
                            <p className="text-sm text-indigo-200">
                              Total Posts
                            </p>
                            <p className="text-3xl font-extrabold">
                              {formatNumber(p.totalPosts)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-indigo-200">
                              Last 30 Days
                            </p>
                            <p className="text-3xl font-extrabold">
                              {formatNumber(p.postsLast30Days)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-indigo-200">
                              Success Rate
                            </p>
                            <p className="text-3xl font-extrabold">
                              {p.engagementRate.toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-indigo-200">Growth</p>
                            <p className="text-3xl font-extrabold">
                              {p.growthPercent > 0 ? "+" : ""}
                              {p.growthPercent.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Detail cards row */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Health */}
                        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
                          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
                            Account Health
                          </h3>
                          <div className="flex items-center gap-3">
                            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                              <div
                                className="h-full rounded-full bg-green-500 transition-all duration-700"
                                style={{
                                  width: `${p.avgHealth * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-lg font-bold text-[var(--text-primary)]">
                              {(p.avgHealth * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="mt-4 flex gap-2">
                            {p.successPosts > 0 && (
                              <Badge variant="success">
                                ✓ {p.successPosts} success
                              </Badge>
                            )}
                            {p.failedPosts > 0 && (
                              <Badge variant="danger">
                                ✗ {p.failedPosts} failed
                              </Badge>
                            )}
                            {p.scheduledPosts > 0 && (
                              <Badge variant="warning">
                                ⏱ {p.scheduledPosts} scheduled
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Top Post */}
                        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
                          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
                            Best Performing Post
                          </h3>
                          {p.topPost ? (
                            <>
                              <p className="line-clamp-3 text-sm text-[var(--text-primary)]">
                                {p.topPost.title}
                              </p>
                              <p className="mt-2 text-xs text-[var(--text-muted)]">
                                via {p.topPost.account}
                                {p.topPost.postedAt &&
                                  ` · ${new Date(p.topPost.postedAt).toLocaleDateString()}`}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-[var(--text-muted)]">
                              No successful posts yet
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Growth Trend */}
                      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 shadow-sm">
                        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
                          30-Day Trend
                        </h3>
                        <div className="flex items-center gap-3">
                          <GrowthIndicator percent={p.growthPercent} />
                          <span className="text-sm text-[var(--text-muted)]">
                            {p.postsLast30Days} posts in the last 30 days
                            compared to the previous period
                          </span>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                ))}
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
