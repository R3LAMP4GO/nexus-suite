"use client";

/* ── CircuitBreakerBadge ─────────────────────────────────────── */

export interface CircuitBreakerBadgeProps {
  state: string;
}

export function CircuitBreakerBadge({ state }: CircuitBreakerBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">
      CB: {state}
    </span>
  );
}

/* ── AccountWarmingBadge ─────────────────────────────────────── */

export interface AccountWarmingBadgeProps {
  status: string;
}

export function AccountWarmingBadge({ status }: AccountWarmingBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
      {status}
    </span>
  );
}

/* ── PlatformIcon ────────────────────────────────────────────── */

export interface PlatformIconProps {
  platform: string;
  size?: number;
}

export function PlatformIcon({ platform, size = 20 }: PlatformIconProps) {
  return (
    <span style={{ fontSize: size, lineHeight: 1 }} aria-label={platform}>
      🔗
    </span>
  );
}
