"use client";

import { api } from "@/lib/trpc-client";
import type { PricingTier } from "@/lib/stripe";

const TIERS: {
  key: PricingTier;
  name: string;
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
  const checkout = api.pricing.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  function handleSelect(tier: PricingTier) {
    checkout.mutate({ tier });
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-center text-3xl font-bold text-gray-900">
          Choose your plan
        </h1>
        <p className="mb-10 text-center text-gray-500">
          Select a tier to get started
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.key}
              className="flex flex-col rounded-lg border bg-white p-6 shadow-sm"
            >
              <h2 className="mb-4 text-xl font-semibold text-gray-900">
                {tier.name}
              </h2>

              <div className="mb-6 flex-1 space-y-3">
                {FEATURES.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-600">{f.label}</span>
                    <span className="font-medium text-gray-900">
                      {tier[f.accessor]}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">ML Features</span>
                  <span className="font-medium text-gray-900">
                    {tier.mlFeatures ? "✓" : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Multiplier</span>
                  <span className="font-medium text-gray-900">
                    {tier.multiplier ? "✓" : "—"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleSelect(tier.key)}
                disabled={checkout.isPending}
                className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {checkout.isPending ? "Redirecting..." : "Get Started"}
              </button>
            </div>
          ))}
        </div>

        {checkout.error && (
          <p className="mt-4 text-center text-sm text-red-600">
            {checkout.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
