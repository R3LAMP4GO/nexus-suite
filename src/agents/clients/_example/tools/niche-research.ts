// Example: client-specific tool.
// Niche-specific tools are loaded by the plugin resolver and made available
// to the client's custom agents. They do NOT have direct Infisical access —
// credentials are injected by the worker via prepareContext().

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { wrapToolHandler } from "@/agents/general";

/** Example niche-specific tool: search fitness supplement databases. */
export const searchSupplementDb = createTool({
  id: "searchSupplementDb",
  description: "Search a fitness supplement database for ingredient info and claims",
  inputSchema: z.object({
    ingredient: z.string().describe("Supplement ingredient to look up"),
    claimType: z
      .enum(["efficacy", "safety", "dosage", "interactions"])
      .optional()
      .describe("Type of information to retrieve"),
  }),
  execute: async (executionContext) => {
    const { ingredient, claimType } = executionContext.context;
    const wrappedFn = wrapToolHandler(
      async (input: { ingredient: string; claimType?: string }) => ({
        ingredient: input.ingredient,
        claimType: input.claimType ?? "efficacy",
        results: [] as string[],
        source: "client-plugin",
        status: "pending-integration" as const,
      }),
      { agentName: "client-plugin", toolName: "searchSupplementDb" },
    );
    return wrappedFn({ ingredient, claimType });
  },
});
