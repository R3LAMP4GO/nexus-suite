import { z } from "zod";
import { createTRPCRouter, onboardedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Platform, Prisma } from "@/generated/prisma/client";
import { composeTransforms } from "../../../../services/media-engine/src/transforms";
import { sendMediaJob } from "@/server/services/media-queue";
import { incrementUsage } from "@/server/services/usage-tracking";

const DEFAULT_VARIATION_COUNT = 5;

export const uploadRouter = createTRPCRouter({
  uploadAndMultiply: onboardedProcedure
    .input(
      z.object({
        url: z.string().url(),
        platform: z.nativeEnum(Platform),
        scriptId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify script ownership if provided
      if (input.scriptId) {
        const script = await ctx.db.script.findUnique({
          where: { id: input.scriptId },
          select: { organizationId: true },
        });
        if (!script || script.organizationId !== ctx.organizationId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
        }
      }

      // Create source video
      const sourceVideo = await ctx.db.sourceVideo.create({
        data: {
          organizationId: ctx.organizationId,
          url: input.url,
          platform: input.platform,
          scriptId: input.scriptId ?? null,
        },
      });

      // Auto-generate variations with safe defaults
      const variations = await ctx.db.$transaction(
        Array.from({ length: DEFAULT_VARIATION_COUNT }, (_, i) => {
          const transforms = composeTransforms();
          return ctx.db.videoVariation.create({
            data: {
              sourceVideoId: sourceVideo.id,
              variationIndex: i,
              transforms: transforms as unknown as Prisma.InputJsonValue,
              fileHash: "",
              pHash: "",
              status: "pending",
            },
          });
        }),
      );

      // Queue media processing jobs
      await Promise.all(
        variations.map((v: any) =>
          sendMediaJob({
            type: "transform",
            organizationId: ctx.organizationId,
            sourceUrl: sourceVideo.url,
            transforms: v.transforms as Record<string, unknown>,
            outputKey: `variations/${v.id}`,
          }),
        ),
      );

      // Track usage
      for (let i = 0; i < variations.length; i++) {
        await incrementUsage(ctx.organizationId, "videos");
      }

      // Email notification fires from media-completion-worker when all
      // variations finish processing (not at queue time).

      return { sourceVideo, variations };
    }),

  getStatus: onboardedProcedure
    .input(z.object({ sourceVideoId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sourceVideo = await ctx.db.sourceVideo.findUnique({
        where: { id: input.sourceVideoId },
        include: {
          variations: {
            orderBy: { variationIndex: "asc" },
            include: {
              postRecords: {
                select: {
                  id: true,
                  status: true,
                  scheduledAt: true,
                  postedAt: true,
                  platform: true,
                },
              },
            },
          },
          script: true,
        },
      });

      if (!sourceVideo || sourceVideo.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source video not found" });
      }

      return sourceVideo;
    }),
});
