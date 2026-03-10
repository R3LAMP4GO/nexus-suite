"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/ui/skeleton";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

interface GenerateTabProps {
  selectedSourceId: string | null;
  generateVariations: UseMutationResult<any, any, any, any>;
  variations: UseQueryResult<any[], any>;
}

export function GenerateTab({
  selectedSourceId,
  generateVariations,
  variations,
}: GenerateTabProps) {
  const [variationCount, setVariationCount] = useState(5);

  if (!selectedSourceId) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] py-12 text-center text-[var(--text-muted)]">
        Select a source video in the Source tab first
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
          Generate Variations
        </h2>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-[var(--text-secondary)]">
            Count
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={variationCount}
            onChange={(e) =>
              setVariationCount(
                Math.max(1, Math.min(20, Number(e.target.value))),
              )
            }
            className="w-20 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:border-[var(--accent)] focus:outline-none"
          />
          <Button
            onClick={() =>
              generateVariations.mutate({
                sourceVideoId: selectedSourceId,
                count: variationCount,
              })
            }
            loading={generateVariations.isPending}
            loadingText="Generating..."
          >
            Generate Variations
          </Button>
        </div>
        {generateVariations.error && (
          <p className="mt-2 text-sm text-[var(--danger)]">
            {generateVariations.error.message}
          </p>
        )}
      </div>

      {/* Variations Grid */}
      {variations.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : variations.data && variations.data.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">
            Variations
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {variations.data.map((v: any) => (
              <div
                key={v.id}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    #{v.variationIndex}
                  </span>
                  <Badge colorMap="status" value={v.status} />
                </div>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {Object.keys(v.transforms ?? {}).join(", ") || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
