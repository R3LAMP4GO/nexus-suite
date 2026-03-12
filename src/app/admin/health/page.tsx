"use client";

import { api } from "@/lib/trpc-client";

const SERVICE_GROUPS: Record<string, string[]> = {
  "AI & LLM": ["ZHIPU_API_KEY"],
  Payments: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  "Secrets Management": ["INFISICAL_CLIENT_ID", "INFISICAL_CLIENT_SECRET"],
  "Cloud Storage": ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"],
  "Proxy / Scraping": ["IPROYAL_API_KEY"],
  Infrastructure: ["DATABASE_URL", "REDIS_URL", "AUTH_SECRET"],
};

const MONITORING_LINKS = [
  { label: "Prometheus", href: "http://localhost:9090", description: "Metrics & alerting" },
  { label: "Grafana", href: "http://localhost:3001", description: "Dashboards & visualization" },
];

export default function AdminHealthPage() {
  const { data, isLoading, refetch } = api.admin.getSystemHealth.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const checks = data?.checks ?? [];
  const checkedKeys = new Set(checks.map((c) => c.key));

  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">System Health</h1>
            <p className="mt-1 text-sm text-gray-400">
              API keys, infrastructure status, and monitoring
            </p>
          </div>
          <div className="flex items-center gap-4">
            {data && (
              <span className="text-xs text-gray-500">
                Last checked: {new Date(data.timestamp).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => refetch()}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* DB Connection */}
        <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">
              {isLoading ? "⏳" : data?.dbConnected ? "✅" : "❌"}
            </span>
            <div>
              <div className="text-sm font-medium text-gray-200">Database Connection</div>
              <div className="text-xs text-gray-500">
                {isLoading
                  ? "Checking..."
                  : data?.dbConnected
                    ? "PostgreSQL is reachable"
                    : "PostgreSQL connection failed"}
              </div>
            </div>
          </div>
        </div>

        {/* Service groups */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(SERVICE_GROUPS).map(([group, keys]) => {
            const groupChecks = keys
              .map((k) => checks.find((c) => c.key === k))
              .filter(Boolean) as typeof checks;
            const allConfigured = groupChecks.length > 0 && groupChecks.every((c) => c.configured);
            const anyMissing = groupChecks.some((c) => !c.configured);

            return (
              <div
                key={group}
                className="rounded-lg border border-gray-800 bg-gray-900 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200">{group}</h3>
                  <span className="text-lg">
                    {isLoading ? "⏳" : allConfigured ? "✅" : anyMissing ? "❌" : "⏳"}
                  </span>
                </div>
                <div className="space-y-2">
                  {keys.map((key) => {
                    const check = checks.find((c) => c.key === key);
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-400">{check?.name ?? key}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${
                            isLoading
                              ? "bg-gray-800 text-gray-500"
                              : check?.configured
                                ? "bg-green-900/50 text-green-400"
                                : "bg-red-900/50 text-red-400"
                          }`}
                        >
                          {isLoading
                            ? "..."
                            : check?.configured
                              ? "Configured"
                              : "Missing"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary bar */}
        {!isLoading && data && (
          <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center gap-6 text-sm">
              <div className="text-gray-400">
                <span className="font-semibold text-green-400">
                  {checks.filter((c) => c.configured).length}
                </span>{" "}
                configured
              </div>
              <div className="text-gray-400">
                <span className="font-semibold text-red-400">
                  {checks.filter((c) => !c.configured).length}
                </span>{" "}
                missing
              </div>
              <div className="text-gray-400">
                <span className="font-semibold text-gray-300">{checks.length}</span>{" "}
                total checks
              </div>
            </div>
          </div>
        )}

        {/* Monitoring quick-links */}
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-white">Monitoring</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {MONITORING_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-900 p-4 transition hover:border-gray-700 hover:bg-gray-800"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900/40 text-blue-400">
                  📊
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-200">{link.label}</div>
                  <div className="text-xs text-gray-500">{link.description}</div>
                </div>
                <span className="ml-auto text-gray-600">↗</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
