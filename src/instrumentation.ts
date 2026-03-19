/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Bootstraps the Mastra agent registry and Sentry server-side SDKs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { bootstrapAgents } = await import("@/agents/registry");
    bootstrapAgents();
    console.log("[instrumentation] agent registry bootstrapped");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
