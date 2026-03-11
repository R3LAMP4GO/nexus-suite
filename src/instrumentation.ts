/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Bootstraps the Mastra agent registry so tRPC handlers can read it.
 */
export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapAgents } = await import("@/agents/registry");
    bootstrapAgents();
    console.log("[instrumentation] agent registry bootstrapped");
  }
}
