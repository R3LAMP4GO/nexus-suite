"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/* ── Context ────────────────────────────────────────────────── */

interface TabsContextValue {
  activeValue: string;
  setActiveValue: (v: string) => void;
}

const TabsContext = createContext<TabsContextValue>({
  activeValue: "",
  setActiveValue: () => {},
});

/* ── Tabs Root ──────────────────────────────────────────────── */

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue = "",
  value,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const activeValue = value ?? internal;

  const setActiveValue = useCallback(
    (v: string) => {
      if (onValueChange) onValueChange(v);
      else setInternal(v);
    },
    [onValueChange],
  );

  return (
    <TabsContext.Provider value={{ activeValue, setActiveValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

/* ── Tab List ───────────────────────────────────────────────── */

export function TabsList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-1 border-b border-[var(--border)] pb-px",
        className,
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

/* ── Tab Trigger ────────────────────────────────────────────── */

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { activeValue, setActiveValue } = useContext(TabsContext);
  const isActive = activeValue === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => setActiveValue(value)}
      className={cn(
        "relative px-4 py-2 text-sm font-medium transition",
        isActive
          ? "text-[var(--accent)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ── Tab Content ────────────────────────────────────────────── */

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { activeValue } = useContext(TabsContext);
  if (activeValue !== value) return null;
  return (
    <div role="tabpanel" className={cn("pt-6", className)}>
      {children}
    </div>
  );
}
