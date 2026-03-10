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
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Upload,
  BarChart3,
  GitBranch,
  Bot,
  Eye,
  Rocket,
  CreditCard,
  Settings,
  Search,
  Plus,
  Shield,
} from "@/components/icons";

/* ── Types ──────────────────────────────────────────────────── */

interface CommandItem {
  id: string;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
  href?: string;
  action?: () => void;
  section: "Pages" | "Actions";
  shortcut?: string;
}

/* ── Items ──────────────────────────────────────────────────── */

const ITEMS: CommandItem[] = [
  // Pages
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", section: "Pages" },
  { id: "scripts", label: "Scripts", icon: FileText, href: "/dashboard/studio", section: "Pages" },
  { id: "upload", label: "Upload", icon: Upload, href: "/dashboard/upload", section: "Pages" },
  { id: "analytics", label: "Analytics", icon: BarChart3, href: "/dashboard/analytics", section: "Pages" },
  { id: "workflows", label: "Workflows", icon: GitBranch, href: "/workflows", section: "Pages" },
  { id: "agents", label: "Agents", icon: Bot, href: "/agents", section: "Pages" },
  { id: "competitors", label: "Competitors", icon: Eye, href: "/competitors", section: "Pages" },
  { id: "multiplier", label: "Multiplier", icon: Rocket, href: "/multiplier", section: "Pages" },
  { id: "pricing", label: "Pricing", icon: CreditCard, href: "/pricing", section: "Pages" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings", section: "Pages" },
  { id: "admin", label: "Admin Panel", icon: Shield, href: "/admin", section: "Pages" },
  // Actions
  { id: "action-upload", label: "Upload Video", icon: Upload, href: "/dashboard/upload", section: "Actions" },
  { id: "action-workflow", label: "New Workflow Run", icon: Plus, href: "/workflows", section: "Actions" },
  { id: "action-track", label: "Track Competitor", icon: Eye, href: "/competitors", section: "Actions" },
  { id: "action-multiply", label: "Run Multiplier", icon: Rocket, href: "/multiplier", section: "Actions" },
];

/* ── Context ────────────────────────────────────────────────── */

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  open: false,
  setOpen: () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

/* ── Provider ───────────────────────────────────────────────── */

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </CommandPaletteContext.Provider>
  );
}

/* ── Palette ────────────────────────────────────────────────── */

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = ITEMS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );

  // Group by section
  const sections = filtered.reduce(
    (acc, item) => {
      if (!acc[item.section]) acc[item.section] = [];
      acc[item.section].push(item);
      return acc;
    },
    {} as Record<string, CommandItem[]>,
  );

  const flatList = Object.values(sections).flat();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const execute = useCallback(
    (item: CommandItem) => {
      onClose();
      if (item.href) router.push(item.href);
      if (item.action) item.action();
    },
    [router, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatList[selectedIndex]) {
      e.preventDefault();
      execute(flatList[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let itemIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, actions…"
            className="flex-1 bg-transparent text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          />
          <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {flatList.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              No results found
            </p>
          ) : (
            Object.entries(sections).map(([section, items]) => (
              <div key={section}>
                <p className="px-4 py-1.5 text-xs font-semibold uppercase text-[var(--text-muted)]">
                  {section}
                </p>
                {items.map((item) => {
                  itemIndex++;
                  const idx = itemIndex;
                  const isSelected = idx === selectedIndex;
                  const ItemIcon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => execute(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition",
                        isSelected
                          ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]",
                      )}
                    >
                      <ItemIcon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.shortcut && (
                        <span className="text-xs text-[var(--text-muted)]">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
