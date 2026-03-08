import { type ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  primary:
    "rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50",
  secondary: "rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100",
  danger: "rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_CLASSES;
  loading?: boolean;
  loadingText?: string;
}

export function Button({
  variant = "primary",
  loading = false,
  loadingText,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {loading ? (loadingText ?? "Saving...") : children}
    </button>
  );
}
