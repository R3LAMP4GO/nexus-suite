const PLATFORM_COLORS: Record<string, string> = {
  YOUTUBE: "bg-red-100 text-red-800",
  TIKTOK: "bg-gray-900 text-white",
  INSTAGRAM: "bg-pink-100 text-pink-800",
  LINKEDIN: "bg-blue-100 text-blue-800",
  X: "bg-gray-100 text-gray-800",
  FACEBOOK: "bg-indigo-100 text-indigo-800",
};

const CIRCUIT_COLORS: Record<string, string> = {
  CLOSED: "bg-green-100 text-green-800",
  HALF_OPEN: "bg-yellow-100 text-yellow-800",
  OPEN: "bg-red-100 text-red-800",
};

const COLOR_MAPS = {
  platform: PLATFORM_COLORS,
  circuit: CIRCUIT_COLORS,
} as const;

interface BadgeProps {
  variant: keyof typeof COLOR_MAPS;
  value: string;
  className?: string;
}

export function Badge({ variant, value, className = "" }: BadgeProps) {
  const colorMap = COLOR_MAPS[variant];
  const colorClass = colorMap[value] ?? "bg-gray-100 text-gray-800";

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colorClass} ${className}`}
    >
      {value}
    </span>
  );
}
