import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, onboardedProcedure, tierGatedProcedure } from "../trpc";
import { getRegisteredAgents } from "@/server/workflows/agent-delegate";
import { getRecentDiagnostics } from "@/agents/general/tool-wrappers";
import { getBoss } from "@/lib/pg-boss";

// ── Tier classification ─────────────────────────────────────────

type Tier = 1 | 2 | 3;

const TIER_1_NAMES = new Set(["nexus-orchestrator", "orchestrator", "workflow-agent"]);

const TIER_2_NAMES = new Set([
  "youtube-main", "tiktok-main", "instagram-main",
  "linkedin-main", "x-main", "facebook-agent",
]);

const TIER_2_5_NAMES = new Set([
  "community-post-formatter", "shorts-optimizer",
  "duet-stitch-logic", "sound-selector",
  "carousel-sequencer", "story-formatter",
  "professional-tone-adapter", "article-formatter",
  "news-scout", "tone-translator", "x-engagement-responder",
]);

function classifyTier(name: string): Tier {
  if (TIER_1_NAMES.has(name)) return 1;
  if (TIER_2_NAMES.has(name) || TIER_2_5_NAMES.has(name)) return 2;
  return 3;
}

// ── Router ──────────────────────────────────────────────────────

export const agentsRouter = createTRPCRouter({
  stats: onboardedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.$queryRaw<
      Array<{
        agentId: string;
        totalRuns: bigint;
        completedRuns: bigint;
        avgDurationMs: number | null;
        totalPromptTokens: bigint;
        totalCompletionTokens: bigint;
        lastRunAt: Date | null;
      }>
    >`
      SELECT
        s."agentId",
        COUNT(*)::bigint                                          AS "totalRuns",
        COUNT(*) FILTER (WHERE s."status" = 'COMPLETED')::bigint  AS "completedRuns",
        AVG(s."durationMs")                                       AS "avgDurationMs",
        COALESCE(SUM((s."tokenUsage"->>'prompt')::int), 0)::bigint   AS "totalPromptTokens",
        COALESCE(SUM((s."tokenUsage"->>'completion')::int), 0)::bigint AS "totalCompletionTokens",
        MAX(s."startedAt")                                        AS "lastRunAt"
      FROM "WorkflowStepLog" s
      JOIN "WorkflowRun" r ON r."id" = s."runId"
      WHERE r."organizationId" = ${ctx.organizationId}
        AND s."agentId" IS NOT NULL
      GROUP BY s."agentId"
      ORDER BY COUNT(*) DESC
    `;

    return rows.map((r) => ({
      agentId: r.agentId,
      totalRuns: Number(r.totalRuns),
      completedRuns: Number(r.completedRuns),
      successRate:
        Number(r.totalRuns) > 0
          ? Number(r.completedRuns) / Number(r.totalRuns)
          : 0,
      avgDurationMs: r.avgDurationMs ? Math.round(r.avgDurationMs) : 0,
      totalTokens: Number(r.totalPromptTokens) + Number(r.totalCompletionTokens),
      totalPromptTokens: Number(r.totalPromptTokens),
      totalCompletionTokens: Number(r.totalCompletionTokens),
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
    }));
  }),

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

  invoke: tierGatedProcedure("maxWorkflowRuns")
    .input(
      z.object({
        agentName: z.string().min(1),
        prompt: z.string().min(1).max(10000),
        model: z.string().optional(),
        maxTokens: z.number().int().positive().max(16000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const registry = getRegisteredAgents();
      if (!registry.has(input.agentName)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Agent "${input.agentName}" not found`,
        });
      }

      const b = await getBoss();
      const jobId = await b.send("agent-execute", {
        type: "agent-execute",
        agentId: input.agentName,
        input: {
          prompt: input.prompt,
          model: input.model,
          maxTokens: input.maxTokens,
        },
        organizationId: ctx.organizationId,
        createdAt: new Date().toISOString(),
      });

      return { queued: true, jobId, agentName: input.agentName };
    }),

  batchInvoke: tierGatedProcedure("maxWorkflowRuns")
    .input(
      z.object({
        agents: z
          .array(
            z.object({
              agentName: z.string().min(1),
              prompt: z.string().min(1).max(10000),
              model: z.string().optional(),
              maxTokens: z.number().int().positive().max(16000).optional(),
            }),
          )
          .min(1)
          .max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const registry = getRegisteredAgents();
      for (const a of input.agents) {
        if (!registry.has(a.agentName)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Agent "${a.agentName}" not found`,
          });
        }
      }

      const b = await getBoss();
      const results = await Promise.all(
        input.agents.map(async (a) => {
          const jobId = await b.send("agent-execute", {
            type: "agent-execute",
            agentId: a.agentName,
            input: {
              prompt: a.prompt,
              model: a.model,
              maxTokens: a.maxTokens,
            },
            organizationId: ctx.organizationId,
            createdAt: new Date().toISOString(),
          });
          return { agentName: a.agentName, jobId, queued: true };
        }),
      );

      return { results };
    }),
});
