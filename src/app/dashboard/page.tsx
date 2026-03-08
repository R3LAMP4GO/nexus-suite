"use client";

import { api } from "@/lib/trpc-client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SPEND_COLORS: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

export default function DashboardPage() {
  const workflows = api.dashboard.getWorkflowStats.useQuery();
  const spend = api.dashboard.getSpendSummary.useQuery();
  const posts = api.dashboard.getRecentPosts.useQuery();
  const health = api.dashboard.getAccountHealth.useQuery();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-8 text-2xl font-bold text-gray-900">Dashboard</h1>

        {/* Workflow Stats */}
        <div className="mb-8 grid grid-cols-4 gap-4">
          {(["active", "completed", "failed", "queued"] as const).map((key) => (
            <Card key={key} className="p-4">
              <p className="text-sm font-medium capitalize text-gray-500">{key}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {workflows.isLoading ? "—" : (workflows.data?.[key] ?? 0)}
              </p>
            </Card>
          ))}
        </div>

        {/* LLM Spend Bar */}
        <Card className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">LLM Spend (Today)</h2>
          {spend.isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : spend.data ? (
            <>
              <div className="mb-2 flex justify-between text-sm text-gray-600">
                <span>${(spend.data.spentCents / 100).toFixed(2)} spent</span>
                <span>${(spend.data.budgetCents / 100).toFixed(2)} budget</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full rounded-full transition-all ${SPEND_COLORS[spend.data.status] ?? "bg-gray-400"}`}
                  style={{ width: `${Math.min(spend.data.percentUsed, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {spend.data.percentUsed.toFixed(1)}% used — ${(spend.data.remainingCents / 100).toFixed(2)} remaining
              </p>
            </>
          ) : null}
        </Card>

        {/* Account Health Grid */}
        <Card className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Account Health</h2>
          {health.isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : !health.data?.length ? (
            <p className="text-gray-500">No platform accounts connected</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {health.data.map((token) => (
                <div key={token.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {token.platform} — {token.accountLabel}
                    </span>
                    <Badge variant="circuit" value={token.circuitState} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: `${token.healthScore * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">
                      {(token.healthScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {token.accountType} · Failures: {token.consecutiveFailures}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Posts */}
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Recent Posts</h2>
          {posts.isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : !posts.data?.length ? (
            <p className="text-gray-500">No posts yet</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {posts.data.map((post) => (
                <li key={post.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{post.title}</span>
                    <span className="ml-2 text-xs text-gray-500">{post.platform}</span>
                  </div>
                  <span className="text-xs text-gray-400">{post.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
