"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
  Menu,
  X,
  Search,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
} from "@/components/icons";

/* ── Nav Items ──────────────────────────────────────────────── */

interface NavItem {
  href: string;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
  children?: { href: string; label: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/studio", label: "Scripts", icon: FileText },
  { href: "/dashboard/upload", label: "Upload", icon: Upload },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/workflows", label: "Workflows", icon: GitBranch },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/agents/observability", label: "Agent Logs", icon: Search },
  { href: "/competitors", label: "Competitors", icon: Eye },
  { href: "/multiplier", label: "Multiplier", icon: Rocket },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    children: [{ href: "/settings/usage", label: "Usage" }],
  },
];

const ADMIN_ROLES = ["OWNER", "ADMIN"];
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/competitors",
  "/multiplier",
  "/workflows",
  "/agents",
  "/settings",
  "/pricing",
];

const COLLAPSED_KEY = "nexus-sidebar-collapsed";

/* ── Sidebar ────────────────────────────────────────────────── */

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  // Mobile open/close
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop collapsed
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  // Close mobile sidebar on route change — intentional setState on external event
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  if (!isProtected) return null;

  const userRole = (session?.user as any)?.role;
  const showAdmin = ADMIN_ROLES.includes(userRole);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={cn("flex items-center gap-2 px-4 py-5", collapsed && "justify-center px-2")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]">
          <span className="text-sm font-bold text-white">N</span>
        </div>
        {!collapsed && (
          <span className="text-lg font-bold text-[var(--text-primary)]">
            Nexus Suite
          </span>
        )}
      </div>

      {/* Search trigger */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <button
            onClick={() => {
              document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition hover:border-[var(--border-hover)]"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const ItemIcon = item.icon;
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  collapsed && "justify-center px-2",
                  active
                    ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]"
                    : "text-[var(--sidebar-text)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]",
                )}
              >
                <ItemIcon className="h-5 w-5 shrink-0" />
                {!collapsed && item.label}
              </Link>
              {active && item.children && !collapsed && (
                <div className="ml-8 mt-1 space-y-1">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      aria-current={pathname === child.href ? "page" : undefined}
                      className={cn(
                        "block rounded-md px-3 py-1.5 text-xs font-medium transition",
                        pathname === child.href
                          ? "text-[var(--sidebar-active-text)] bg-[var(--bg-tertiary)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                      )}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {showAdmin && (
          <Link
            href="/admin"
            aria-current={pathname.startsWith("/admin") ? "page" : undefined}
            title={collapsed ? "Admin" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              collapsed && "justify-center px-2",
              pathname.startsWith("/admin")
                ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)]"
                : "text-[var(--sidebar-text)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]",
            )}
          >
            <Shield className="h-5 w-5 shrink-0" />
            {!collapsed && "Admin"}
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--sidebar-border)] p-3 space-y-2">
        {/* Theme + Collapse */}
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          <ThemeToggle />
          <button
            onClick={toggleCollapse}
            className="hidden lg:inline-flex items-center justify-center rounded-md p-2 text-[var(--text-muted)] transition hover:bg-[var(--bg-tertiary)]"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* User */}
        {session?.user && !collapsed && (
          <div>
            <div className="flex items-center gap-2">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-xs font-medium text-[var(--text-muted)]">
                  {session.user.name?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {session.user.name}
                </p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="mt-2 w-full rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-lg bg-[var(--card-bg)] p-2 shadow-md lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5 text-[var(--text-primary)]" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-5 p-1 text-[var(--text-muted)]"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col shrink-0 border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-all duration-200",
          collapsed ? "w-16" : "w-56",
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
