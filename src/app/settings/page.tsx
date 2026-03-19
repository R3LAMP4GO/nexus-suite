"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc-client";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Badge, Button, Skeleton } from "@/components/ui/index";

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

const platformTokenColumns: ColumnDef<PlatformToken>[] = [
  {
    accessorKey: "platform",
    header: "Platform / Label",
    cell: (row) => (
      <span className="font-medium text-[var(--text-primary)]">
        {row.platform} — {row.accountLabel}
      </span>
    ),
  },
  { accessorKey: "accountType", header: "Type" },
  {
    accessorKey: "warmupStatus",
    header: "Warmup",
    cell: (row) =>
      row.warmupStatus !== "READY" ? (
        <span className="text-yellow-600 dark:text-yellow-400">
          {row.warmupStatus}
        </span>
      ) : (
        <span className="text-[var(--text-muted)]">READY</span>
      ),
  },
  {
    accessorKey: "healthScore",
    header: "Health",
    cell: (row) => (
      <div className="flex items-center gap-1">
        <div className="h-2 w-16 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
          <div
            className="h-full rounded-full bg-green-500"
            style={{ width: `${row.healthScore * 100}%` }}
          />
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {(row.healthScore * 100).toFixed(0)}%
        </span>
      </div>
    ),
  },
  {
    accessorKey: "circuitState",
    header: "Circuit State",
    cell: (row) => <Badge colorMap="circuit" value={row.circuitState} />,
  },
];

export default function SettingsPage() {
  const org = api.settings.getOrgDetails.useQuery();
  const tokens = api.settings.listPlatformTokens.useQuery();
  const utils = api.useUtils();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [brandJson, setBrandJson] = useState("");
  const [brandJsonError, setBrandJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (org.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync form state from query data
      setName(org.data.name);
      setSlug(org.data.slug);
      setBrandJson(
        org.data.brandConfig
          ? JSON.stringify(org.data.brandConfig, null, 2)
          : "{}",
      );
    }
  }, [org.data]);

  const updateOrg = api.settings.updateOrgDetails.useMutation({
    onSuccess: () => utils.settings.getOrgDetails.invalidate(),
  });

  const updateBrand = api.settings.updateBrandConfig.useMutation({
    onSuccess: () => utils.settings.getOrgDetails.invalidate(),
  });

  function handleSaveOrg() {
    updateOrg.mutate({ name, slug });
  }

  function handleSaveBrand() {
    try {
      const parsed = JSON.parse(brandJson);
      setBrandJsonError(null);
      updateBrand.mutate({ brandConfig: parsed });
    } catch {
      setBrandJsonError("Invalid JSON — please check syntax");
    }
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
        <section className="mb-8 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
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

        {/* Brand Config */}
        <section className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
            Brand Configuration
          </h2>
          <textarea
            value={brandJson}
            onChange={(e) => {
              setBrandJson(e.target.value);
              setBrandJsonError(null);
            }}
            rows={10}
            className={`w-full rounded-md border bg-[var(--input-bg)] px-3 py-2 font-mono text-sm text-[var(--input-text)] ${
              brandJsonError
                ? "border-[var(--danger)]"
                : "border-[var(--input-border)]"
            }`}
            placeholder='{"voice": "professional", "tone": "friendly"}'
          />
          {brandJsonError && (
            <p className="mt-1 text-sm text-[var(--danger)]">
              {brandJsonError}
            </p>
          )}
          <Button
            onClick={handleSaveBrand}
            loading={updateBrand.isPending}
            loadingText="Saving..."
            className="mt-3"
          >
            Save Brand Config
          </Button>
          {updateBrand.error && (
            <p className="mt-2 text-sm text-[var(--danger)]">
              {updateBrand.error.message}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
