"use client";

import { useState } from "react";
import Image from "next/image";
import { api } from "@/lib/trpc-client";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Badge, Button, Modal, SkeletonCard } from "@/components/ui/index";

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
}

function CreatorCard({
  creator,
  isExpanded,
  onToggleExpand,
  onToggleAutoReproduce,
  onSetThreshold,
  onAnalyze,
  onReproduce,
}: CreatorCardProps) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {creator.avatarUrl ? (
            <Image
              src={creator.avatarUrl}
              alt={creator.username}
              width={40}
              height={40}
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
          onAnalyze={onAnalyze}
          onReproduce={onReproduce}
        />
      )}
    </div>
  );
}

/* ── Post List ─────────────────────────────────────────────── */

type Post = {
  id: string;
  isOutlier: boolean;
  title: string | null;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string | Date | null;
};

function PostList({
  creatorId,
  onAnalyze,
  onReproduce,
}: {
  creatorId: string;
  onAnalyze: (postId: string) => void;
  onReproduce: (postId: string) => void;
}) {
  const { data, isLoading } = api.competitors.getCreatorPosts.useQuery({
    creatorId,
    limit: 20,
  });

  const columns: ColumnDef<Post>[] = [
    {
      accessorKey: "isOutlier",
      header: "",
      sortable: false,
      cell: (row) => (row.isOutlier ? <span title="Outlier">🔥</span> : null),
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
              onReproduce(row.id);
            }}
          >
            Reproduce
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="max-h-96 overflow-y-auto border-t border-[var(--border)]">
      <DataTable
        columns={columns}
        data={(data?.posts ?? []) as unknown as Post[]}
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
