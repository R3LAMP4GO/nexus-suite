import { cn } from "@/lib/utils";

/* ── Semantic color maps ──────────────────────────────────── */

const SEMANTIC_VARIANTS = {
  default: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  success: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
} as const;

/* ── Domain-specific color maps ───────────────────────────── */

export const PLATFORM_COLORS: Record<string, string> = {
  YOUTUBE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  TIKTOK: "bg-gray-900 text-white dark:bg-gray-700 dark:text-gray-100",
  INSTAGRAM: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  LINKEDIN: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  X: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  FACEBOOK: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
};

export const CIRCUIT_COLORS: Record<string, string> = {
  CLOSED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  HALF_OPEN: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  OPEN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export const STATUS_COLORS: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  PROCESSING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  DONE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  ABORTED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  RUNNING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  SCHEDULED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  PUBLISHED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  DRAFT: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export const COLOR_MAPS = {
  platform: PLATFORM_COLORS,
  circuit: CIRCUIT_COLORS,
  status: STATUS_COLORS,
} as const;

/* ── Badge component ──────────────────────────────────────── */

type SemanticBadgeProps = {
  variant?: keyof typeof SEMANTIC_VARIANTS;
  children: React.ReactNode;
  className?: string;
};

type MappedBadgeProps = {
  colorMap: keyof typeof COLOR_MAPS;
  value: string;
  className?: string;
};

type BadgeProps = SemanticBadgeProps | MappedBadgeProps;

function isMapped(p: BadgeProps): p is MappedBadgeProps {
  return "colorMap" in p;
}

export function Badge(props: BadgeProps) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

  if (isMapped(props)) {
    const map = COLOR_MAPS[props.colorMap];
    const color = map[props.value] ?? SEMANTIC_VARIANTS.default;
    return (
      <span className={cn(base, color, props.className)} role="status">
        {props.value}
      </span>
    );
  }

  return (
    <span
      className={cn(base, SEMANTIC_VARIANTS[props.variant ?? "default"], props.className)}
    >
      {props.children}
    </span>
  );
}
