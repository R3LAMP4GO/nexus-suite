"use client";

import { useState } from "react";
import { api } from "@/lib/trpc-client";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-900/50 text-green-400 border border-green-800",
  PENDING_SETUP: "bg-yellow-900/50 text-yellow-400 border border-yellow-800",
  PENDING_PAYMENT: "bg-orange-900/50 text-orange-400 border border-orange-800",
  SUSPENDED: "bg-red-900/50 text-red-400 border border-red-800",
  PAST_DUE: "bg-red-900/50 text-red-400 border border-red-800",
  CANCELED: "bg-gray-800 text-gray-400 border border-gray-700",
  INACTIVE: "bg-gray-800 text-gray-400 border border-gray-700",
  PAUSED: "bg-blue-900/50 text-blue-400 border border-blue-800",
};

const TIER_LABELS: Record<string, string> = {
  PRO: "Pro ($149/mo)",
  MULTIPLIER: "Multiplier ($499/mo)",
  ENTERPRISE: "Enterprise",
};

type StatusFilter = "ALL" | "PENDING_SETUP" | "ACTIVE" | "SUSPENDED";

type Org = {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  pricingTier: string;
  subscriptionStatus: string;
  onboardingStatus: string;
  niche: string;
  accountCount: number;
};

export default function AdminOrganizationsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const { data, isLoading, refetch } = api.admin.listOrgs.useQuery({
    statusFilter,
    limit: 50,
  });

  const setStatus = api.admin.setOnboardingStatus.useMutation({
    onSuccess: () => refetch(),
  });

  function handleToggle(orgId: string, currentStatus: string) {
    const newStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (
      newStatus === "SUSPENDED" &&
      !window.confirm("Suspend this organization? They will lose dashboard access.")
    ) {
      return;
    }
    setStatus.mutate({ orgId, status: newStatus });
  }

  const orgColumns: ColumnDef<Org>[] = [
    {
      accessorKey: "name",
      header: "Organization",
      cell: (row) => (
        <div>
          <div className="font-medium text-gray-100">{row.name}</div>
          <div className="text-xs text-gray-500">{row.slug}</div>
        </div>
      ),
    },
    {
      accessorKey: "ownerName",
      header: "Owner",
      cell: (row) => (
        <div>
          <div className="text-gray-200">{row.ownerName}</div>
          <div className="text-xs text-gray-500">{row.ownerEmail}</div>
        </div>
      ),
    },
    {
      accessorKey: "pricingTier",
      header: "Tier",
      cell: (row) => (
        <span className="text-gray-300">
          {TIER_LABELS[row.pricingTier] ?? row.pricingTier}
        </span>
      ),
    },
    {
      accessorKey: "subscriptionStatus",
      header: "Subscription",
      cell: (row) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_COLORS[row.subscriptionStatus] ?? "bg-gray-800 text-gray-400"
          }`}
        >
          {row.subscriptionStatus}
        </span>
      ),
    },
    {
      accessorKey: "onboardingStatus",
      header: "Onboarding",
      cell: (row) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_COLORS[row.onboardingStatus] ?? "bg-gray-800 text-gray-400"
          }`}
        >
          {row.onboardingStatus}
        </span>
      ),
    },
    {
      accessorKey: "niche",
      header: "Niche",
    },
    {
      accessorKey: "accountCount",
      header: "Accounts",
    },
    {
      accessorKey: "id",
      header: "Actions",
      sortable: false,
      cell: (row) => (
        <>
          {row.onboardingStatus === "PENDING_SETUP" && (
            <button
              onClick={() => handleToggle(row.id, row.onboardingStatus)}
              disabled={setStatus.isPending}
              className="rounded-md bg-green-600 px-3 py-1 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
            >
              Activate
            </button>
          )}
          {row.onboardingStatus === "ACTIVE" && (
            <button
              onClick={() => handleToggle(row.id, row.onboardingStatus)}
              disabled={setStatus.isPending}
              className="rounded-md bg-red-900/50 px-3 py-1 text-sm font-medium text-red-400 transition hover:bg-red-900 disabled:opacity-50"
            >
              Suspend
            </button>
          )}
        </>
      ),
    },
  ];

  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Organizations</h1>
            <p className="mt-1 text-sm text-gray-400">
              Manage organizations, review onboarding, activate clients
            </p>
          </div>
          <div className="flex gap-2">
            {(["ALL", "PENDING_SETUP", "ACTIVE", "SUSPENDED"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  statusFilter === f
                    ? "bg-white text-gray-900"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {f === "ALL" ? "All" : f.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <DataTable<Org>
          columns={orgColumns}
          data={(data?.orgs ?? []) as unknown as Org[]}
          isLoading={isLoading}
          emptyMessage="No organizations found"
        />

        {setStatus.error && (
          <div className="mt-4 rounded-md bg-red-900/50 p-3 text-sm text-red-400">
            {setStatus.error.message}
          </div>
        )}
      </div>
    </div>
  );
}
