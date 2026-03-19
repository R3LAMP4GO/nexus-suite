"use client";

import { api } from "@/lib/trpc-client";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import type { PricingTier } from "@/lib/stripe";

const TIERS: {
  key: PricingTier;
  name: string;
  price: string;
  accounts: string;
  workflowRuns: string;
  videosPerMonth: string;
  llmBudget: string;
  mlFeatures: boolean;
  multiplier: boolean;
}[] = [
  {
    key: "PRO",
    name: "Pro",
    price: "$149/mo",
    accounts: "3",
    workflowRuns: "50",
    videosPerMonth: "30",
    llmBudget: "$5/day",
    mlFeatures: false,
    multiplier: false,
  },
  {
    key: "MULTIPLIER",
    name: "Multiplier",
    price: "$499/mo",
    accounts: "25",
    workflowRuns: "500",
    videosPerMonth: "300",
    llmBudget: "$15/day",
    mlFeatures: true,
    multiplier: true,
  },
  {
    key: "ENTERPRISE",
    name: "Enterprise",
    price: "Contact us",
    accounts: "Unlimited",
    workflowRuns: "Unlimited",
    videosPerMonth: "Unlimited",
    llmBudget: "$100/day",
    mlFeatures: true,
    multiplier: true,
  },
];

const FEATURES = [
  { label: "Accounts", accessor: "accounts" as const },
  { label: "Workflow Runs", accessor: "workflowRuns" as const },
  { label: "Videos/mo", accessor: "videosPerMonth" as const },
  { label: "LLM Budget", accessor: "llmBudget" as const },
];

export default function PricingPage() {
  const { data: session } = useSession();
  const currentTier = session?.user?.pricingTier as string | undefined;

  const checkout = api.pricing.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  function handleSelect(tier: PricingTier) {
    checkout.mutate({ tier });
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-center text-3xl font-bold text-[var(--text-primary)]">
          Choose your plan
        </h1>
        <p className="mb-10 text-center text-[var(--text-muted)]">
          Select a tier to get started
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => {
            const isCurrent = currentTier === tier.key;
            return (
              <div
                key={tier.key}
                className={`flex flex-col rounded-lg border p-6 shadow-sm ${
                  isCurrent
                    ? "border-[var(--accent)] bg-blue-50 dark:bg-blue-900/20 ring-2 ring-[var(--accent)]"
                    : "border-[var(--card-border)] bg-[var(--card-bg)]"
                }`}
              >
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                  {tier.name}
                </h2>
                <p className="mt-1 mb-4 text-2xl font-bold text-[var(--text-primary)]">
                  {tier.price}
                </p>
                {isCurrent && (
                  <span className="mb-3 inline-flex self-start rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-xs font-medium text-white">
                    Current plan
                  </span>
                )}

                <div className="mb-6 flex-1 space-y-3">
                  {FEATURES.map((f) => (
                    <div
                      key={f.label}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-[var(--text-muted)]">{f.label}</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {tier[f.accessor]}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-muted)]">ML Features</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {tier.mlFeatures ? "\u2713" : "\u2014"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-muted)]">Multiplier</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {tier.multiplier ? "\u2713" : "\u2014"}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() => handleSelect(tier.key)}
                  disabled={isCurrent}
                  loading={checkout.isPending}
                  loadingText="Redirecting..."
                  className="w-full"
                >
                  {isCurrent ? "Current Plan" : "Get Started"}
                </Button>
              </div>
            );
          })}
        </div>

        {checkout.error && (
          <p className="mt-4 text-center text-sm text-[var(--danger)]">
            {checkout.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
