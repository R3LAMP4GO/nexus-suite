import { z } from "zod";
import { createTRPCRouter, onboardedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { ScriptStatus } from "@/generated/prisma/client";

export const scriptsRouter = createTRPCRouter({
  list: onboardedProcedure
    .input(
      z
        .object({
          status: z.nativeEnum(ScriptStatus).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const where: { organizationId: string; status?: ScriptStatus } = {
        organizationId: ctx.organizationId,
      };
      if (input?.status) {
        where.status = input.status;
      }
      return ctx.db.script.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: onboardedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const script = await ctx.db.script.findUnique({
        where: { id: input.id },
      });
      if (!script || script.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
      }
      return script;
    }),

  create: onboardedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        hookText: z.string().min(1),
        bodyText: z.string().min(1),
        ctaText: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.script.create({
        data: {
          organizationId: ctx.organizationId,
          title: input.title,
          hookText: input.hookText,
          bodyText: input.bodyText,
          ctaText: input.ctaText,
          status: "DRAFT",
        },
      });
    }),

  update: onboardedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        hookText: z.string().min(1).optional(),
        bodyText: z.string().min(1).optional(),
        ctaText: z.string().min(1).optional(),
        status: z.nativeEnum(ScriptStatus).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.script.findUnique({
        where: { id: input.id },
        select: { organizationId: true },
      });
      if (!existing || existing.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
      }

      const { id, ...data } = input;
      return ctx.db.script.update({
        where: { id },
        data,
      });
    }),

  delete: onboardedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.script.findUnique({
        where: { id: input.id },
        select: { organizationId: true },
      });
      if (!existing || existing.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
      }

      return ctx.db.script.delete({ where: { id: input.id } });
    }),
});
