"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { Check, AlertCircle, Info, X } from "@/components/icons";

/* ── Types ──────────────────────────────────────────────────── */

type ToastType = "success" | "error" | "info" | "warning";

interface ToastOptions {
  type?: ToastType;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  action?: { label: string; onClick: () => void };
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

/* ── Context ────────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

/* ── Styling ────────────────────────────────────────────────── */

const TYPE_CONFIG: Record<
  ToastType,
  { accent: string; icon: typeof Check; bgClass: string }
> = {
  success: {
    accent: "bg-green-500",
    icon: Check,
    bgClass: "text-green-600 dark:text-green-400",
  },
  error: {
    accent: "bg-red-500",
    icon: AlertCircle,
    bgClass: "text-red-600 dark:text-red-400",
  },
  warning: {
    accent: "bg-yellow-500",
    icon: AlertCircle,
    bgClass: "text-yellow-600 dark:text-yellow-400",
  },
  info: {
    accent: "bg-blue-500",
    icon: Info,
    bgClass: "text-blue-600 dark:text-blue-400",
  },
};

/* ── Toast Item ─────────────────────────────────────────────── */

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[t.type];
  const IconComp = cfg.icon;
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    // Start animation after a tick to trigger CSS transition
    requestAnimationFrame(() => {
      el.style.width = "0%";
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), t.duration);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, onDismiss]);

  return (
    <div
      className={cn(
        "relative flex w-80 items-start gap-3 overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-lg transition-all duration-300",
        t.exiting
          ? "translate-x-full opacity-0"
          : "translate-x-0 opacity-100 animate-in",
      )}
      role="alert"
    >
      {/* Left accent bar */}
      <div className={cn("absolute inset-y-0 left-0 w-1", cfg.accent)} />

      {/* Icon */}
      <IconComp className={cn("mt-0.5 h-5 w-5 shrink-0", cfg.bgClass)} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{t.message}</p>
        {t.action && (
          <button
            onClick={t.action.onClick}
            className="mt-1 text-sm font-medium text-[var(--accent)] hover:underline"
          >
            {t.action.label}
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(t.id)}
        className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Progress bar */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--bg-tertiary)]">
        <div
          ref={progressRef}
          className={cn("h-full transition-all ease-linear", cfg.accent)}
          style={{
            width: "100%",
            transitionDuration: `${t.duration}ms`,
          }}
        />
      </div>
    </div>
  );
}

/* ── Provider ───────────────────────────────────────────────── */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const addToast = useCallback(
    (message: string, options?: ToastOptions): string => {
      const id = `toast-${++toastCounter}`;
      setToasts((prev) => [
        ...prev,
        {
          id,
          message,
          type: options?.type ?? "info",
          duration: options?.duration ?? 4000,
          action: options?.action,
        },
      ]);
      return id;
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast: addToast, dismiss }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ── Hook ───────────────────────────────────────────────────── */

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// Usage:
// const { toast } = useToast();
// toast("Workflow started", { type: "success" });
// toast("Failed to save", { type: "error", duration: 6000 });
