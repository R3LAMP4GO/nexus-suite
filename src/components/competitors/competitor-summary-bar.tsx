"use client";

export interface CompetitorSummaryBarProps {
  trackedCount: number;
  newPostsCount: number;
  outlierCount: number;
}

export function CompetitorSummaryBar({ trackedCount, newPostsCount, outlierCount }: CompetitorSummaryBarProps) {
  return (
    <div className="flex gap-4 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
      <span className="text-sm">Tracked: {trackedCount}</span>
      <span className="text-sm">New Posts: {newPostsCount}</span>
      <span className="text-sm">Outliers: {outlierCount}</span>
    </div>
  );
}
