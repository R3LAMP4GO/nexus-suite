import { z } from "zod";
import { createTRPCRouter, onboardedProcedure } from "../trpc";
import { getRegisteredAgents } from "@/server/workflows/agent-delegate";
import { getRecentDiagnostics } from "@/agents/general/tool-wrappers";

// ── Tier classification ─────────────────────────────────────────

type Tier = 1 | 2 | 3;

const TIER_1_NAMES = new Set(["nexus-orchestrator", "workflow-agent"]);

function classifyTier(name: string): Tier {
  if (TIER_1_NAMES.has(name)) return 1;
  if (name.endsWith("-agent")) return 2;
  return 3;
}

// ── Router ──────────────────────────────────────────────────────

export const agentsRouter = createTRPCRouter({
  list: onboardedProcedure.query(() => {
    const registry = getRegisteredAgents();
    return Array.from(registry.entries()).map(([name, entry]) => ({
      name,
      tier: classifyTier(name),
      toolCount: entry.tools.length,
    }));
  }),

  getRecentActivity: onboardedProcedure
    .input(
      z.object({
        agentName: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const { agentName, limit = 50, cursor } = input ?? {};

      const runs = await ctx.db.workflowRunLog.findMany({
        where: { organizationId: ctx.organizationId },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          runId: true,
          workflowName: true,
          steps: true,
          createdAt: true,
          status: true,
        },
      });

      let nextCursor: string | undefined;
      if (runs.length > limit) {
        const next = runs.pop();
        nextCursor = next?.id;
      }

      // Extract agent-delegate steps from run logs
      type StepEntry = {
        stepId: string;
        status: string;
        output?: { text?: string; toolCalls?: unknown[] };
        error?: string;
        durationMs: number;
      };

      const activities: Array<{
        agentName: string;
        stepId: string;
        status: string;
        outputPreview: string;
        durationMs: number;
        workflowName: string;
        runId: string;
        timestamp: string;
        error?: string;
      }> = [];

      for (const run of runs) {
        const steps = (run.steps as StepEntry[]) ?? [];
        for (const step of steps) {
          // Agent delegate steps have agent name as part of their stepId
          const stepAgent = step.stepId;
          if (agentName && !stepAgent.includes(agentName)) continue;

          const outputText = step.output?.text ?? "";
          activities.push({
            agentName: stepAgent,
            stepId: step.stepId,
            status: step.status,
            outputPreview: outputText.slice(0, 200),
            durationMs: step.durationMs,
            workflowName: run.workflowName,
            runId: run.runId,
            timestamp: run.createdAt.toISOString(),
            error: step.error,
          });
        }
      }

      return { activities, nextCursor };
    }),

  getDiagnostics: onboardedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(({ input }) => {
      const limit = input?.limit ?? 50;
      return getRecentDiagnostics(limit);
    }),
});
