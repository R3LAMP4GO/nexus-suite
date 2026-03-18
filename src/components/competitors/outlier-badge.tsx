"use client";

export interface OutlierBadgeProps {
  multiplier: number;
  threshold: number;
}

export function OutlierBadge({ multiplier, threshold }: OutlierBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      {multiplier.toFixed(1)}x (threshold: {threshold}x)
    </span>
  );
}
