"use client";

import { api } from "@/lib/trpc-client";
import { SkeletonCard } from "@/components/ui/skeleton";

export default function StudioPage() {
  const scripts = api.scripts.list.useQuery({ status: "APPROVED" });

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Your Scripts</h1>
          <p className="mt-2 text-lg text-[var(--text-muted)]">
            Read through your approved scripts before recording
          </p>
        </div>

        {/* Script List */}
        {scripts.isLoading ? (
          <div className="space-y-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : !scripts.data?.length ? (
          <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-bg)] p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-[var(--text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-[var(--text-primary)]">
              No approved scripts yet
            </h3>
            <p className="mt-2 text-[var(--text-muted)]">
              Your team will prepare scripts for you.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {scripts.data.map((script) => (
              <div
                key={script.id}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6 shadow-sm transition hover:shadow-md"
              >
                {/* Title + Badge */}
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                    {script.title}
                  </h2>
                  <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    ✓ Ready to Record
                  </span>
                </div>

                {/* Teleprompter Sections */}
                <div className="space-y-4">
                  <div className="rounded-lg border-l-4 border-purple-500 bg-purple-50 p-4 dark:bg-purple-900/20">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
                      Hook · 0-3s
                    </p>
                    <p className="text-lg font-bold leading-relaxed text-[var(--text-primary)]">
                      {script.hookText}
                    </p>
                  </div>
                  <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-900/20">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                      Body
                    </p>
                    <p className="text-base leading-relaxed text-[var(--text-secondary)]">
                      {script.bodyText}
                    </p>
                  </div>
                  <div className="rounded-lg border-l-4 border-green-500 bg-green-50 p-4 dark:bg-green-900/20">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
                      Call to Action
                    </p>
                    <p className="text-lg font-semibold leading-relaxed text-[var(--text-primary)]">
                      {script.ctaText}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
