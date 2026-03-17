"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/trpc-client";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Badge, Button, Modal, SkeletonCard } from "@/components/ui/index";
import { CompetitorSummaryBar } from "@/components/competitors/competitor-summary-bar";
import { OutlierBadge } from "@/components/competitors/outlier-badge";
import { ReproduceProgress } from "@/components/competitors/reproduce-progress";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export default function CompetitorsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [profileUrl, setProfileUrl] = useState("");
  const [expandedCreator, setExpandedCreator] = useState<string | null>(null);

  const { data, isLoading, refetch } = api.competitors.listCreators.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );

  const addCreator = api.competitors.addCreator.useMutation({
    onSuccess: () => {
      setShowAddModal(false);
      setProfileUrl("");
      refetch();
    },
  });

  const toggleAutoReproduce = api.competitors.toggleAutoReproduce.useMutation({
    onSuccess: () => refetch(),
  });

  const setThreshold = api.competitors.setThreshold.useMutation({
    onSuccess: () => refetch(),
  });

  const analyzePost = api.competitors.analyzePost.useMutation();
  const reproducePost = api.competitors.reproducePost.useMutation();

  // Compute summary stats from creators data
  const creators = data?.creators ?? [];
  const trackedCount = creators.length;
  const totalPosts = creators.reduce((sum, c) => sum + c._count.posts, 0);
  // Approximate new posts in 24h — use total posts as proxy since we lack timestamps here
  const newPostsCount = totalPosts;
  // Outlier count: we don't have per-post data at this level, so we show 0 until posts are loaded
  // This will be populated from individual PostList components via a shared count
  const [outlierCount, setOutlierCount] = useState(0);

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Competitor Tracking
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Monitor creators, detect outlier posts, reproduce winning content
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>+ Track Creator</Button>
        </div>

        {/* Summary Bar */}
        <div className="mb-6">
          <CompetitorSummaryBar
            trackedCount={trackedCount}
            newPostsCount={newPostsCount}
            outlierCount={outlierCount}
          />
        </div>

        {/* Add Creator Modal */}
        <Modal
          open={showAddModal}
          onClose={() => {
            setShowAddModal(false);
            setProfileUrl("");
          }}
          title="Track a Creator"
          maxWidth="max-w-md"
        >
          <input
            type="url"
            placeholder="https://youtube.com/@creator"
            value={profileUrl}
            onChange={(e) => setProfileUrl(e.target.value)}
            className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:border-[var(--accent)] focus:outline-none"
          />
          {addCreator.error && (
            <p className="mt-2 text-sm text-[var(--danger)]">
              {addCreator.error.message}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowAddModal(false);
                setProfileUrl("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addCreator.mutate({ profileUrl })}
              disabled={!profileUrl}
              loading={addCreator.isPending}
              loadingText="Adding..."
            >
              Add
            </Button>
          </div>
        </Modal>

        {/* Loading / Empty / List */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : !data?.creators.length ? (
          <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] py-12 text-center text-[var(--text-muted)]">
            No creators tracked yet. Click &quot;+ Track Creator&quot; to start.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.creators.map((creator) => (
              <CreatorCard
                key={creator.id}
                creator={creator}
                isExpanded={expandedCreator === creator.id}
                onToggleExpand={() =>
                  setExpandedCreator(
                    expandedCreator === creator.id ? null : creator.id,
                  )
                }
                onToggleAutoReproduce={() =>
                  toggleAutoReproduce.mutate({ creatorId: creator.id })
                }
                onSetThreshold={(threshold: number) =>
                  setThreshold.mutate({ creatorId: creator.id, threshold })
                }
                onAnalyze={(postId: string) => analyzePost.mutate({ postId })}
                onReproduce={(postId: string) =>
                  reproducePost.mutate({ postId })
                }
                onOutlierCountUpdate={(count: number) =>
                  setOutlierCount((prev) => prev + count)
                }
              />
            ))}
          </div>
        )}

        {toggleAutoReproduce.error && (
          <div className="mt-4 rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
            {toggleAutoReproduce.error.message}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Creator Card ──────────────────────────────────────────── */

interface CreatorCardProps {
  creator: {
    id: string;
    platform: string;
    username: string;
    profileUrl: string;
    avatarUrl: string | null;
    followerCount: number;
    autoReproduce: boolean;
    outlierThreshold: number;
    lastPolledAt: string | Date | null;
    _count: { posts: number };
  };
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleAutoReproduce: () => void;
  onSetThreshold: (t: number) => void;
  onAnalyze: (postId: string) => void;
  onReproduce: (postId: string) => void;
  onOutlierCountUpdate: (count: number) => void;
}

function CreatorCard({
  creator,
  isExpanded,
  onToggleExpand,
  onToggleAutoReproduce,
  onSetThreshold,
  onAnalyze,
  onReproduce,
  onOutlierCountUpdate,
}: CreatorCardProps) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {creator.avatarUrl ? (
            <img
              src={creator.avatarUrl}
              alt={creator.username}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-sm font-medium text-[var(--text-muted)]">
              {creator.username[0]?.toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-[var(--text-primary)]">
                {creator.username}
              </span>
              <Badge colorMap="platform" value={creator.platform} />
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-muted)]">
              <span>{formatNumber(creator.followerCount)} followers</span>
              <span>{creator._count.posts} posts</span>
              <span>Polled {timeAgo(creator.lastPolledAt)}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={creator.autoReproduce}
              onChange={onToggleAutoReproduce}
              className="rounded border-[var(--input-border)]"
            />
            Auto-reproduce
          </label>

          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            Threshold
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={creator.outlierThreshold}
              onChange={(e) => onSetThreshold(parseFloat(e.target.value))}
              className="w-16"
            />
            <span className="w-6 text-right font-mono">
              {creator.outlierThreshold}
            </span>
          </label>
        </div>

        <button
          onClick={onToggleExpand}
          className="mt-2 w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Hide posts" : "Show posts"}
        >
          {isExpanded ? "▲ Hide posts" : "▼ Show posts"}
        </button>
      </div>

      {isExpanded && (
        <PostList
          creatorId={creator.id}
          outlierThreshold={creator.outlierThreshold}
          onAnalyze={onAnalyze}
          onReproduce={onReproduce}
          onOutlierCountUpdate={onOutlierCountUpdate}
        />
      )}
    </div>
  );
}

/* ── Post List ─────────────────────────────────────────────── */

type ReproduceStatus =
  | "idle"
  | "teardown"
  | "script"
  | "caption"
  | "variation"
  | "complete"
  | "failed";

type Post = {
  id: string;
  isOutlier: boolean;
  outlierScore: number | null;
  title: string | null;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string | Date | null;
  analysis: Record<string, unknown> | null;
  analyzedAt: string | Date | null;
};

function PostList({
  creatorId,
  outlierThreshold,
  onAnalyze,
  onReproduce,
  onOutlierCountUpdate,
}: {
  creatorId: string;
  outlierThreshold: number;
  onAnalyze: (postId: string) => void;
  onReproduce: (postId: string) => void;
  onOutlierCountUpdate: (count: number) => void;
}) {
  const [reproduceStatus, setReproduceStatus] = useState<
    Record<string, ReproduceStatus>
  >({});
  const [expandedAnalysis, setExpandedAnalysis] = useState<Set<string>>(
    new Set(),
  );

  const { data, isLoading } = api.competitors.getCreatorPosts.useQuery(
    { creatorId, limit: 20 },
  );

  const posts = (data?.posts ?? []) as unknown as Post[];

  const prevOutlierCount = useRef(0);
  useEffect(() => {
    const count = posts.filter((p) => p.isOutlier).length;
    if (count !== prevOutlierCount.current) {
      onOutlierCountUpdate(count - prevOutlierCount.current);
      prevOutlierCount.current = count;
    }
  }, [posts, onOutlierCountUpdate]);

  // Compute median engagement for outlier badge multiplier
  const engagements = posts.map((p) => p.views + p.likes + p.comments);
  const medianEngagement = computeMedian(engagements);

  function handleReproduce(postId: string) {
    setReproduceStatus((prev) => ({ ...prev, [postId]: "teardown" }));
    onReproduce(postId);

    // Simulate progress through pipeline stages
    const stages: ReproduceStatus[] = [
      "script",
      "caption",
      "variation",
      "complete",
    ];
    stages.forEach((stage, i) => {
      setTimeout(() => {
        setReproduceStatus((prev) => ({ ...prev, [postId]: stage }));
      }, (i + 1) * 3000);
    });
  }

  function toggleAnalysis(postId: string) {
    setExpandedAnalysis((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }

  const columns: ColumnDef<Post>[] = [
    {
      accessorKey: "isOutlier",
      header: "",
      sortable: false,
      cell: (row) => {
        if (!row.isOutlier) return null;
        const engagement = row.views + row.likes + row.comments;
        const multiplier =
          medianEngagement > 0 ? engagement / medianEngagement : 0;
        return (
          <OutlierBadge
            multiplier={multiplier}
            threshold={outlierThreshold}
          />
        );
      },
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: (row) => (
        <span className="truncate font-medium text-[var(--text-primary)]">
          {row.title ?? "Untitled"}
        </span>
      ),
    },
    {
      accessorKey: "views",
      header: "Views",
      cell: (row) => formatNumber(row.views),
    },
    {
      accessorKey: "likes",
      header: "Likes",
      cell: (row) => formatNumber(row.likes),
    },
    {
      accessorKey: "comments",
      header: "Comments",
      cell: (row) => formatNumber(row.comments),
    },
    {
      accessorKey: "publishedAt",
      header: "Date",
      cell: (row) =>
        row.publishedAt
          ? new Date(row.publishedAt).toLocaleDateString()
          : "",
    },
    {
      accessorKey: "id",
      header: "Actions",
      sortable: false,
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAnalyze(row.id);
              }}
            >
              Analyze
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleReproduce(row.id);
              }}
            >
              Reproduce
            </Button>
            {row.analyzedAt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAnalysis(row.id);
                }}
              >
                {expandedAnalysis.has(row.id) ? "Hide" : "View"} Results
              </Button>
            )}
          </div>
          {reproduceStatus[row.id] &&
            reproduceStatus[row.id] !== "idle" && (
              <ReproduceProgress status={reproduceStatus[row.id]!} />
            )}
          {expandedAnalysis.has(row.id) && row.analysis && (
            <AnalysisInline analysis={row.analysis} />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="max-h-96 overflow-y-auto border-t border-[var(--border)]">
      <DataTable
        columns={columns}
        data={posts}
        isLoading={isLoading}
        emptyMessage="No posts yet"
        rowClassName={(row) =>
          row.isOutlier
            ? "bg-orange-50 dark:bg-orange-900/10"
            : undefined
        }
      />
    </div>
  );
}

/* ── Analysis Inline ───────────────────────────────────────── */

function AnalysisInline({
  analysis,
}: {
  analysis: Record<string, unknown>;
}) {
  const entries = Object.entries(analysis);
  if (entries.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)] italic">
        No analysis data available.
      </p>
    );
  }

  return (
    <div className="mt-1 rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {entries.slice(0, 8).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-2">
            <span className="text-[var(--text-muted)] capitalize">
              {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
            </span>
            <span className="font-medium text-[var(--text-primary)] truncate max-w-[120px]">
              {typeof value === "object"
                ? JSON.stringify(value)
                : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
