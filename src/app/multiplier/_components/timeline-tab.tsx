"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { UseQueryResult } from "@tanstack/react-query";

interface TimelineTabProps {
  selectedSourceId: string | null;
  distributionStatus: UseQueryResult<any[], any>;
}

export function TimelineTab({
  selectedSourceId,
  distributionStatus,
}: TimelineTabProps) {
  if (!selectedSourceId) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] py-12 text-center text-[var(--text-muted)]">
        Select a source video to see distribution timeline
      </div>
    );
  }

  if (distributionStatus.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!distributionStatus.data?.length) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] py-12 text-center text-[var(--text-muted)]">
        No distributions scheduled yet
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm">
      <div className="border-b border-[var(--border)] px-6 py-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Distribution Timeline
        </h2>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {distributionStatus.data.map((post: any) => (
          <li
            key={post.id}
            className="flex items-center gap-4 px-6 py-3"
          >
            <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
              {new Date(post.scheduledAt).toLocaleString()}
            </span>
            <Badge
              colorMap="platform"
              value={post.account?.platform ?? "UNKNOWN"}
            />
            <span className="text-sm text-[var(--text-secondary)]">
              {post.account?.accountLabel}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              Var #{post.variation?.variationIndex}
            </span>
            <span className="ml-auto">
              <Badge colorMap="status" value={post.status} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
