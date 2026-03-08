"use client";

import { useState } from "react";
import { api } from "@/lib/trpc-client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Competitor Tracking</h1>
            <p className="mt-1 text-sm text-gray-500">
              Monitor creators, detect outlier posts, reproduce winning content
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            + Track Creator
          </Button>
        </div>

        {/* Add Creator Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <Card className="w-full max-w-md shadow-xl">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Track a Creator</h2>
              <input
                type="url"
                placeholder="https://youtube.com/@creator"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
              {addCreator.error && (
                <p className="mt-2 text-sm text-red-600">{addCreator.error.message}</p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="secondary"
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
            </Card>
          </div>
        )}

        {/* Loading / Empty */}
        {isLoading ? (
          <div className="py-12 text-center text-gray-500">Loading creators...</div>
        ) : !data?.creators.length ? (
          <div className="py-12 text-center text-gray-500">
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
                  setExpandedCreator(expandedCreator === creator.id ? null : creator.id)
                }
                onToggleAutoReproduce={() =>
                  toggleAutoReproduce.mutate({ creatorId: creator.id })
                }
                onSetThreshold={(threshold: number) =>
                  setThreshold.mutate({ creatorId: creator.id, threshold })
                }
                onAnalyze={(postId: string) => analyzePost.mutate({ postId })}
                onReproduce={(postId: string) => reproducePost.mutate({ postId })}
              />
            ))}
          </div>
        )}

        {/* Mutation errors */}
        {toggleAutoReproduce.error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {toggleAutoReproduce.error.message}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Creator Card ──────────────────────────────────────────────

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
    <Card className="p-0 border-gray-200">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          {creator.avatarUrl ? (
            <img
              src={creator.avatarUrl}
              alt={creator.username}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
              {creator.username[0]?.toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-gray-900">
                {creator.username}
              </span>
              <Badge variant="platform" value={creator.platform} />
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
              <span>{formatNumber(creator.followerCount)} followers</span>
              <span>{creator._count.posts} posts</span>
              <span>Polled {timeAgo(creator.lastPolledAt)}</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={creator.autoReproduce}
              onChange={onToggleAutoReproduce}
              className="rounded border-gray-300"
            />
            Auto-reproduce
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-600">
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
            <span className="w-6 text-right font-mono">{creator.outlierThreshold}</span>
          </label>
        </div>

        {/* Expand toggle */}
        <button
          onClick={onToggleExpand}
          className="mt-2 w-full text-center text-xs text-gray-400 hover:text-gray-600"
        >
          {isExpanded ? "▲ Hide posts" : "▼ Show posts"}
        </button>
      </div>

      {/* Expanded post list */}
      {isExpanded && (
        <PostList
          creatorId={creator.id}
          onAnalyze={onAnalyze}
          onReproduce={onReproduce}
        />
      )}
    </Card>
  );
}

// ── Post List ─────────────────────────────────────────────────

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

  if (isLoading) {
    return <div className="border-t px-4 py-3 text-center text-xs text-gray-400">Loading posts...</div>;
  }

  if (!data?.posts.length) {
    return <div className="border-t px-4 py-3 text-center text-xs text-gray-400">No posts yet</div>;
  }

  return (
    <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto border-t">
      {data.posts.map((post) => (
        <div
          key={post.id}
          className={`flex items-center gap-3 px-4 py-2 text-sm ${
            post.isOutlier ? "bg-orange-50" : ""
          }`}
        >
          {post.isOutlier && <span title="Outlier">🔥</span>}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-gray-800">
              {post.title ?? "Untitled"}
            </div>
            <div className="flex gap-3 text-xs text-gray-500">
              <span>{formatNumber(post.views)} views</span>
              <span>{formatNumber(post.likes)} likes</span>
              <span>{formatNumber(post.comments)} comments</span>
              {post.publishedAt && (
                <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="secondary"
              onClick={() => onAnalyze(post.id)}
              className="rounded px-2 py-1 text-xs"
              title="Analyze"
            >
              Analyze
            </Button>
            <Button
              variant="secondary"
              onClick={() => onReproduce(post.id)}
              className="rounded px-2 py-1 text-xs"
              title="Reproduce"
            >
              Reproduce
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
