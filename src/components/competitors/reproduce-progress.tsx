"use client";

export interface ReproduceProgressProps {
  status: string;
}

export function ReproduceProgress({ status }: ReproduceProgressProps) {
  return (
    <div className="mt-2 rounded border border-[var(--card-border)] bg-[var(--card-bg)] p-2 text-xs text-[var(--text-muted)]">
      Reproduce: {status}
    </div>
  );
}
