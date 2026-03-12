import { z } from "zod";
import { createTRPCRouter, onboardedProcedure, tierGatedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { getBoss } from "@/lib/pg-boss";

const WORKFLOW_QUEUE = "workflow:run";

// ── Helpers ─────────────────────────────────────────────────────

const AGENTS_DIR = join(process.cwd(), "src", "agents", "clients");

interface WorkflowDef {
  name: string;
  description: string;
  trigger: { type: string; schedule?: string };
}

function loadOrgWorkflows(orgId: string): WorkflowDef[] {
  const workflowDir = join(AGENTS_DIR, orgId, "workflows");
  if (!existsSync(workflowDir)) return [];

  const files = readdirSync(workflowDir).filter((f) => f.endsWith(".yaml"));
  return files.map((file) => {
    const raw = readFileSync(join(workflowDir, file), "utf-8");
    const parsed = parseYaml(raw) as Record<string, unknown>;
    return {
      name: (parsed.name as string) ?? file.replace(".yaml", ""),
      description: (parsed.description as string) ?? "",
      trigger: (parsed.trigger as WorkflowDef["trigger"]) ?? { type: "manual" },
    };
  });
}

// ── Router ──────────────────────────────────────────────────────

export const workflowsRouter = createTRPCRouter({
  list: onboardedProcedure.query(({ ctx }) => {
    return loadOrgWorkflows(ctx.organizationId);
  }),

  runHistory: onboardedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit = 25 } = input ?? {};

      const records = await ctx.db.workflowRunLog.findMany({
        where: { organizationId: ctx.organizationId },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          runId: true,
          workflowName: true,
          status: true,
          startedAt: true,
          completedAt: true,
          durationMs: true,
          error: true,
          createdAt: true,
        },
      });

      let nextCursor: string | undefined;
      if (records.length > limit) {
        const next = records.pop();
        nextCursor = next?.id;
      }

      return { records, nextCursor };
    }),

  getRunDetails: onboardedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.workflowRunLog.findUnique({
        where: { runId: input.runId },
      });

      if (!run || run.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workflow run not found" });
      }

      return run;
    }),

  // ── WorkflowRun + WorkflowStepLog (structured run inspector) ──

  listRuns: onboardedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
        status: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit = 25, status } = input ?? {};

      const where: Record<string, unknown> = {
        organizationId: ctx.organizationId,
      };
      if (status) where.status = status;

      const runs = await ctx.db.workflowRun.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          workflowName: true,
          status: true,
          startedAt: true,
          completedAt: true,
          durationMs: true,
          error: true,
          triggeredBy: true,
          _count: { select: { steps: true } },
        },
      });

      let nextCursor: string | undefined;
      if (runs.length > limit) {
        const next = runs.pop();
        nextCursor = next?.id;
      }

      return { runs, nextCursor };
    }),

  getRunDetail: onboardedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.workflowRun.findUnique({
        where: { id: input.runId },
        include: {
          steps: {
            orderBy: { startedAt: "asc" },
          },
        },
      });

      if (!run || run.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workflow run not found" });
      }

      return run;
    }),

  runNow: tierGatedProcedure("maxWorkflowRuns")
    .input(z.object({ workflowName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const workflows = loadOrgWorkflows(ctx.organizationId);
      const match = workflows.find((w) => w.name === input.workflowName);

      if (!match) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Workflow "${input.workflowName}" not found`,
        });
      }

      const b = await getBoss();
      await b.send(WORKFLOW_QUEUE, {
        workflowName: input.workflowName,
        organizationId: ctx.organizationId,
        triggeredAt: new Date().toISOString(),
      });

      return { queued: true, workflowName: input.workflowName };
    }),
});
