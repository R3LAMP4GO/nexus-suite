export default function SuspendedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] p-8 shadow-lg text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">
          Account Suspended
        </h1>
        <p className="text-[var(--text-muted)] mb-6">
          Your account has been suspended. If you believe this is an error,
          please contact our support team.
        </p>
        <a
          href="mailto:support@nexus-suite.com"
          className="inline-block rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          Contact Support
        </a>
      </div>
    </div>
  );
}
