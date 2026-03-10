"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/trpc-client";
import { Badge, Button, Skeleton } from "@/components/ui/index";

const PLATFORMS = [
  {
    key: "YOUTUBE" as const,
    label: "YouTube",
    icon: "🎬",
    href: "/api/oauth/youtube",
  },
  {
    key: "TIKTOK" as const,
    label: "TikTok",
    icon: "🎵",
    href: "/api/oauth/tiktok",
  },
  {
    key: "INSTAGRAM" as const,
    label: "Instagram",
    icon: "📸",
    href: "/api/oauth/instagram",
  },
  {
    key: "X" as const,
    label: "X",
    icon: "𝕏",
    href: "/api/oauth/x",
  },
  {
    key: "LINKEDIN" as const,
    label: "LinkedIn",
    icon: "💼",
    href: "/api/oauth/linkedin",
  },
  {
    key: "FACEBOOK" as const,
    label: "Facebook",
    icon: "📘",
    href: "/api/oauth/facebook",
  },
] as const;

function ConnectionsContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  const { data: connections, isLoading } =
    api.settings.getConnections.useQuery();
  const utils = api.useUtils();
  const disconnect = api.settings.disconnectPlatform.useMutation({
    onSuccess: () => {
      void utils.settings.getConnections.invalidate();
    },
  });

  const connectedPlatforms = new Set(
    connections?.map((c) => c.platform) ?? [],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Social Connections
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Connect your primary social accounts to enable direct publishing and
          analytics.
        </p>
      </div>

      {/* Status banners */}
      {connected && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          ✓ Successfully connected{" "}
          {connected.charAt(0).toUpperCase() + connected.slice(1)}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Connection failed: {error.replace(/_/g, " ")}
        </div>
      )}

      {/* Platform cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PLATFORMS.map(({ key, label, icon, href }) => {
          const isConnected = connectedPlatforms.has(key);
          const connection = connections?.find((c) => c.platform === key);

          return (
            <div
              key={key}
              className="flex flex-col items-center gap-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6"
            >
              <span className="text-4xl">{icon}</span>
              <span className="text-lg font-semibold text-[var(--text-primary)]">
                {label}
              </span>

              {isConnected && connection ? (
                <>
                  <Badge variant="success">Connected</Badge>
                  <span className="text-xs text-[var(--text-muted)]">
                    Since{" "}
                    {new Date(connection.connectedAt).toLocaleDateString()}
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => disconnect.mutate({ platform: key })}
                    loading={disconnect.isPending}
                    loadingText="Disconnecting…"
                    className="mt-auto w-full"
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <>
                  <Badge variant="default">Not connected</Badge>
                  <a
                    href={href}
                    className="mt-auto w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
                  >
                    Connect
                  </a>
                </>
              )}

              {isLoading && <Skeleton className="h-5 w-20" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-[var(--text-muted)]">
          Loading…
        </div>
      }
    >
      <ConnectionsContent />
    </Suspense>
  );
}
