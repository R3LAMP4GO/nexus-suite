"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/trpc-client";

interface ProvisioningStep {
  label: string;
  key: string;
}

const STEPS: ProvisioningStep[] = [
  { label: "Payment received", key: "payment" },
  { label: "Onboarding form submitted", key: "onboarding" },
  { label: "Configuring AI agents for your niche", key: "agents" },
  { label: "Provisioning proxy fleet", key: "proxies" },
  { label: "Setting up content pipeline", key: "pipeline" },
  { label: "Final review by our team", key: "review" },
];

function resolveCompletedSteps(status: string | undefined, accountCount: number): number {
  // Always: payment + onboarding are done (user can't reach this page otherwise)
  let completed = 2;

  // If burner accounts exist → agents configured + proxies assigned
  if (accountCount > 0) {
    completed = 4;
  }

  // If status is ACTIVE → everything is done
  if (status === "ACTIVE") {
    completed = STEPS.length;
  }

  return completed;
}

export default function ProvisioningPage() {
  const [dots, setDots] = useState("");
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();

  // Poll org status every 10 seconds to detect activation
  const { data: orgStatus } = api.onboarding.getProvisioningStatus.useQuery(undefined, {
    refetchInterval: 10_000,
    enabled: !!session?.user?.organizationId,
  });

  const completedSteps = resolveCompletedSteps(
    orgStatus?.onboardingStatus ?? session?.user?.onboardingStatus,
    orgStatus?.accountCount ?? 0,
  );

  const isActive = orgStatus?.onboardingStatus === "ACTIVE";

  // Animated dots for the active step
  useEffect(() => {
    if (isActive) return;
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [isActive]);

  // Redirect to dashboard when activated
  const handleRedirect = useCallback(async () => {
    if (isActive) {
      // Refresh the session so JWT picks up the new onboardingStatus
      await updateSession();
      router.push("/dashboard");
    }
  }, [isActive, updateSession, router]);

  useEffect(() => {
    if (isActive) {
      // Small delay so user sees the "all done" state
      const timer = setTimeout(handleRedirect, 2000);
      return () => clearTimeout(timer);
    }
  }, [isActive, handleRedirect]);

  const activeIndex = completedSteps;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--accent)] shadow-lg shadow-blue-600/30">
          <span className="text-3xl font-bold text-white">N</span>
        </div>

        {isActive ? (
          <>
            <h1 className="mb-2 text-3xl font-bold text-white">
              You&apos;re all set! 🎉
            </h1>
            <p className="mb-10 text-gray-400">
              Your Nexus Suite is ready. Redirecting to your dashboard...
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-3xl font-bold text-white">
              Setting up your Nexus
            </h1>
            <p className="mb-10 text-gray-400">
              Our team is configuring your AI agents and content pipeline.
              <br />
              This typically takes 24-48 hours. We&apos;ll email you when it&apos;s ready.
            </p>
          </>
        )}

        <div className="mx-auto max-w-sm text-left">
          {STEPS.map((step, i) => {
            const isDone = i < completedSteps;
            const isCurrentStep = i === activeIndex && !isActive;

            return (
              <div key={step.key} className="flex items-start gap-3 pb-6 last:pb-0">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${
                      isDone
                        ? "bg-green-500 text-white"
                        : isCurrentStep
                          ? "bg-[var(--accent)] text-white animate-pulse"
                          : "bg-gray-700 text-gray-500"
                    }`}
                  >
                    {isDone ? "✓" : isCurrentStep ? "•" : ""}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`mt-1 h-6 w-0.5 ${
                        isDone ? "bg-green-500/50" : "bg-gray-700"
                      }`}
                    />
                  )}
                </div>
                <span
                  className={`pt-0.5 text-sm ${
                    isDone
                      ? "text-green-400"
                      : isCurrentStep
                        ? "text-white font-medium"
                        : "text-gray-600"
                  }`}
                >
                  {step.label}
                  {isCurrentStep && dots}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-12 text-sm text-gray-500">
          Questions?{" "}
          <a
            href="mailto:support@nexus-suite.com"
            className="text-[var(--accent)] hover:underline"
          >
            Contact our team
          </a>
        </p>
      </div>
    </div>
  );
}
