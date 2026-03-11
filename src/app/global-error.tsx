"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error.digest, error.message);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              A critical error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              className="mt-6 rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
