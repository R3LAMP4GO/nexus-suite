"use client";

import { Suspense, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { redirect, useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "This email is already associated with another sign-in method.",
  NotInvited:
    "This email hasn't been invited yet. Ask your admin for an invitation.",
  Verification:
    "The magic link has expired or has already been used. Please request a new one.",
  Default: "Something went wrong. Please try again.",
};

function LoginForm() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");

  if (status === "authenticated") {
    redirect("/dashboard");
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");

    if (!email || !email.includes("@")) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn("resend", {
        email,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (result?.error) {
        setEmailError(
          result.error === "EmailSignin"
            ? "Failed to send verification email. Please try again."
            : result.error,
        );
      } else {
        setEmailSent(true);
      }
    } catch {
      setEmailError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const errorMessage = error
    ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default
    : null;

  // ── Email sent confirmation screen ──────────────────────────────
  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 to-gray-900 p-4">
        <div className="w-full max-w-sm space-y-6 rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-2xl">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-600/20 text-3xl">
              ✉️
            </div>
            <h1 className="text-xl font-bold text-white">Check your email</h1>
            <p className="text-center text-sm text-gray-400">
              We sent a sign-in link to{" "}
              <span className="font-medium text-white">{email}</span>.
              <br />
              Click the link in the email to sign in.
            </p>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-3">
            <p className="text-center text-xs text-gray-500">
              Didn&apos;t receive it? Check your spam folder, or{" "}
              <button
                onClick={() => {
                  setEmailSent(false);
                  setEmail("");
                }}
                className="text-blue-400 hover:underline"
              >
                try a different email
              </button>
              .
            </p>
          </div>

          <button
            onClick={() => setEmailSent(false)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-gray-700"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Main login form ─────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 to-gray-900 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-2xl">
        {/* Logo + heading */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
            <span className="text-2xl font-bold text-white">N</span>
          </div>
          <h1 className="text-xl font-bold text-white">
            Sign in to Nexus Suite
          </h1>
          <p className="text-sm text-gray-500">
            AI-powered social media management
          </p>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {/* Email form */}
        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-gray-300"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError("");
              }}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoComplete="email"
              autoFocus
            />
            {emailError && (
              <p className="mt-1.5 text-xs text-red-400">{emailError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Sending link..." : "Continue with Email"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-800" />
          <span className="text-xs text-gray-600">or</span>
          <div className="h-px flex-1 bg-gray-800" />
        </div>

        {/* Google OAuth */}
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-300 shadow-sm transition hover:bg-gray-700"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        {/* Dev login */}
        {process.env.NODE_ENV === "development" && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-800" />
              <span className="text-xs text-gray-600">dev only</span>
              <div className="h-px flex-1 bg-gray-800" />
            </div>
            <button
              onClick={() =>
                signIn("credentials", {
                  email: "admin@nexus-suite.com",
                  callbackUrl: "/dashboard",
                })
              }
              className="w-full rounded-lg border border-yellow-700 bg-yellow-900/30 px-4 py-2.5 text-sm font-medium text-yellow-400 transition hover:bg-yellow-900/50"
            >
              Dev Login (Test Admin)
            </button>
          </>
        )}

        {/* Info note */}
        <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-3">
          <p className="text-center text-xs text-gray-500">
            Only pre-approved email addresses can sign in.
            <br />
            Contact your admin if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
