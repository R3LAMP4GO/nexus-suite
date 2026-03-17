"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc-client";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
  Button,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/index";
import { BrandConfigEditor } from "@/components/settings/brand-config-editor";
import {
  CircuitBreakerBadge,
  AccountWarmingBadge,
  PlatformIcon,
} from "@/components/platform";

type PlatformToken = {
  id: string;
  platform: string;
  accountLabel: string;
  accountType: string;
  healthScore: number;
  circuitState: string;
  warmupStatus: string;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
};

function HealthScore({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80
      ? "text-green-600 dark:text-green-400"
      : pct >= 50
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400";
  const barColor =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-1">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-medium ${color}`}>{pct}%</span>
    </div>
  );
}

const platformTokenColumns: ColumnDef<PlatformToken>[] = [
  {
    accessorKey: "platform",
    header: "Platform / Label",
    cell: (row) => (
      <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
        <PlatformIcon platform={row.platform} size={18} />
        {row.platform} — {row.accountLabel}
      </span>
    ),
  },
  { accessorKey: "accountType", header: "Type" },
  {
    accessorKey: "warmupStatus",
    header: "Warmup",
    cell: (row) => <AccountWarmingBadge status={row.warmupStatus} />,
  },
  {
    accessorKey: "healthScore",
    header: "Health",
    cell: (row) => <HealthScore score={row.healthScore} />,
  },
  {
    accessorKey: "circuitState",
    header: "Circuit State",
    cell: (row) => <CircuitBreakerBadge state={row.circuitState} />,
  },
];

export default function SettingsPage() {
  const org = api.settings.getOrgDetails.useQuery();
  const tokens = api.settings.listPlatformTokens.useQuery();
  const utils = api.useUtils();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    if (org.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(org.data.name);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlug(org.data.slug);
    }
  }, [org.data]);

  const updateOrg = api.settings.updateOrgDetails.useMutation({
    onSuccess: () => utils.settings.getOrgDetails.invalidate(),
  });

  const createPortal = api.settings.createPortalSession.useMutation();

  function handleSaveOrg() {
    updateOrg.mutate({ name, slug });
  }

  function handleBillingPortal() {
    createPortal.mutate(undefined, {
      onSuccess: (data) => {
        window.open(data.url, "_blank");
      },
    });
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Settings
          </h1>
          <Link
            href="/settings/usage"
            className="rounded-md bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--border)]"
          >
            View Usage
          </Link>
        </div>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="brand">Brand</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          {/* ── General Tab ─────────────────────────────────────── */}
          <TabsContent value="general">
            {/* Org Details */}
            <section className="mb-8 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
                Organization
              </h2>
              {org.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : org.data ? (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                      Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                      Slug
                    </label>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)]"
                    />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                    <span>Tier: {org.data.pricingTier}</span>
                    <span>
                      Budget: ${(org.data.dailyLlmBudgetCents / 100).toFixed(2)}/day
                    </span>
                    <span>Max Accounts: {org.data.maxAccounts}</span>
                  </div>
                  <Button
                    onClick={handleSaveOrg}
                    loading={updateOrg.isPending}
                    loadingText="Saving..."
                  >
                    Save
                  </Button>
                  {updateOrg.error && (
                    <p className="text-sm text-[var(--danger)]">
                      {updateOrg.error.message}
                    </p>
                  )}
                </div>
              ) : null}
            </section>

            {/* Platform Connections */}
            <section className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
                Platform Connections
              </h2>
              <DataTable
                columns={platformTokenColumns}
                data={(tokens.data ?? []) as PlatformToken[]}
                isLoading={tokens.isLoading}
                emptyMessage="No accounts connected"
              />
            </section>
          </TabsContent>

          {/* ── Brand Tab ───────────────────────────────────────── */}
          <TabsContent value="brand">
            <section className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
                Brand Configuration
              </h2>
              {org.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <BrandConfigEditor
                  initialConfig={
                    (org.data?.brandConfig as Record<string, any> | null) ??
                    null
                  }
                />
              )}
            </section>
          </TabsContent>

          {/* ── Billing Tab ─────────────────────────────────────── */}
          <TabsContent value="billing">
            <section className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
                Billing & Subscription
              </h2>
              <p className="mb-4 text-sm text-[var(--text-muted)]">
                Manage your subscription, payment methods, and invoices through
                the Stripe billing portal.
              </p>
              <Button
                onClick={handleBillingPortal}
                loading={createPortal.isPending}
                loadingText="Opening…"
              >
                Open Billing Portal
              </Button>
              {createPortal.error && (
                <p className="mt-2 text-sm text-[var(--danger)]">
                  {createPortal.error.message}
                </p>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
