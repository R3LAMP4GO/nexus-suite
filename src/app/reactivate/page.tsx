"use client";

import { api } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";

export default function ReactivatePage() {
  const portalMutation = api.settings.createPortalSession.useMutation({
    onSuccess(data) {
      window.location.href = data.url;
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] p-8 shadow-lg text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">
          Subscription Inactive
        </h1>
        <p className="text-[var(--text-muted)] mb-6">
          Your subscription is no longer active. Reactivate it through the
          billing portal to regain access.
        </p>
        {portalMutation.error && (
          <p className="text-[var(--danger)] text-sm mb-4">
            {portalMutation.error.message}
          </p>
        )}
        <Button
          onClick={() => portalMutation.mutate()}
          loading={portalMutation.isPending}
          loadingText="Redirecting..."
        >
          Manage Billing
        </Button>
      </div>
    </div>
  );
}
