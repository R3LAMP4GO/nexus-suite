"use client";

export interface TrendSparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function TrendSparkline({ data, color = "#22c55e", width = 60, height = 20 }: TrendSparklineProps) {
  return (
    <svg width={width} height={height} aria-label={`Sparkline: ${data.join(", ")}`}>
      <rect width={width} height={height} fill="none" stroke={color} strokeWidth={1} rx={2} />
    </svg>
  );
}
