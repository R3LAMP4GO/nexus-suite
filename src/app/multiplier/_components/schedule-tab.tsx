"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

interface ScheduleTabProps {
  selectedSourceId: string | null;
  doneVariations: any[];
  accounts: UseQueryResult<any[], any>;
  scheduleDistribution: UseMutationResult<any, any, any, any>;
}

export function ScheduleTab({
  selectedSourceId,
  doneVariations,
  accounts,
  scheduleDistribution,
}: ScheduleTabProps) {
  const [selectedVariationIds, setSelectedVariationIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(
    new Set(),
  );
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [startAt, setStartAt] = useState("");

  const toggleVariation = (id: string) => {
    setSelectedVariationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!selectedSourceId || doneVariations.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] py-12 text-center text-[var(--text-muted)]">
        {!selectedSourceId
          ? "Select a source video first"
          : "Generate and wait for variations to complete"}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm space-y-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        Schedule Distribution
      </h2>

      {/* Variation selection */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
          Variations
        </h3>
        <div className="flex flex-wrap gap-2">
          {doneVariations.map((v: any) => (
            <label
              key={v.id}
              className="flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1 text-sm cursor-pointer hover:bg-[var(--bg-tertiary)]"
            >
              <input
                type="checkbox"
                checked={selectedVariationIds.has(v.id)}
                onChange={() => toggleVariation(v.id)}
                className="rounded border-[var(--input-border)]"
              />
              #{v.variationIndex}
            </label>
          ))}
        </div>
      </div>

      {/* Account selection */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
          Accounts
        </h3>
        <div className="flex flex-wrap gap-2">
          {(accounts.data ?? []).map((a: any) => (
            <label
              key={a.id}
              className="flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1 text-sm cursor-pointer hover:bg-[var(--bg-tertiary)]"
            >
              <input
                type="checkbox"
                checked={selectedAccountIds.has(a.id)}
                onChange={() => toggleAccount(a.id)}
                className="rounded border-[var(--input-border)]"
              />
              <Badge colorMap="platform" value={a.platform} />
              <span className="text-[var(--text-secondary)]">
                {a.accountLabel}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Scheduling controls */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
          Stagger (min)
          <input
            type="number"
            min={1}
            value={intervalMinutes}
            onChange={(e) =>
              setIntervalMinutes(Math.max(1, Number(e.target.value)))
            }
            className="w-20 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
          Start
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
        <Button
          onClick={() => {
            scheduleDistribution.mutate({
              variationIds: [...selectedVariationIds],
              accountIds: [...selectedAccountIds],
              startAt: new Date(startAt),
              intervalMinutes,
            });
            setSelectedVariationIds(new Set());
            setSelectedAccountIds(new Set());
          }}
          disabled={
            selectedVariationIds.size === 0 ||
            selectedAccountIds.size === 0 ||
            !startAt
          }
          loading={scheduleDistribution.isPending}
          loadingText="Scheduling..."
        >
          Schedule
        </Button>
      </div>
      {scheduleDistribution.error && (
        <p className="text-sm text-[var(--danger)]">
          {scheduleDistribution.error.message}
        </p>
      )}
    </div>
  );
}
