import { z } from "zod";
import { createTRPCRouter, onboardedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Platform, Prisma } from "@/generated/prisma/client";
import { composeTransforms } from "../../../../services/media-engine/src/transforms";
import { sendMediaJob } from "@/server/services/media-queue";
import type { TransformFragment } from "@/server/services/media-types";
import { incrementUsage } from "@/server/services/usage-tracking";
import {
  getUploadSignedUrl,
  fileExists,
  getSignedUrl,
} from "@/server/services/r2-storage";

const DEFAULT_VARIATION_COUNT = 5;

export const uploadRouter = createTRPCRouter({
  uploadAndMultiply: onboardedProcedure
    .input(
      z.object({
        key: z.string().min(1),
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
          url: input.key,
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
            transforms: v.transforms as unknown as TransformFragment,
            outputKey: `variations/${v.id}`,
            variationId: v.id,
            sourceVideoId: sourceVideo.id,
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

  /** Generate a presigned URL for direct client-side upload to R2. */
  getPresignedUploadUrl: onboardedProcedure
    .input(
      z.object({
        filename: z.string(),
        contentType: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = `videos/${ctx.organizationId}/${crypto.randomUUID()}-${input.filename}`;
      const url = await getUploadSignedUrl(key, input.contentType);
      return { url, key };
    }),

  /** Confirm a client-side upload completed by checking the file exists in R2. */
  confirmUpload: onboardedProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Ensure the key belongs to this organization
      if (!input.key.startsWith(`videos/${ctx.organizationId}/`)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Key does not belong to this organization" });
      }

      const meta = await fileExists(input.key);
      if (!meta) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found in storage" });
      }

      return { key: input.key, contentLength: meta.contentLength, contentType: meta.contentType };
    }),

  /** Generate a signed download URL for a stored file. */
  getDownloadUrl: onboardedProcedure
    .input(
      z.object({
        key: z.string(),
        expiresIn: z.number().min(60).max(86400).default(3600),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Strict prefix check for source videos (videos/{orgId}/...)
      const isOrgVideo = input.key.startsWith(`videos/${ctx.organizationId}/`);

      // Variation outputs use `variations/{variationId}` (no orgId in key),
      // so verify ownership via DB: variation → sourceVideo → organizationId.
      let isOrgVariation = false;
      if (!isOrgVideo && input.key.startsWith("variations/")) {
        const variationId = input.key.slice("variations/".length);
        const variation = await ctx.db.videoVariation.findUnique({
          where: { id: variationId },
          select: { sourceVideo: { select: { organizationId: true } } },
        });
        isOrgVariation =
          variation?.sourceVideo.organizationId === ctx.organizationId;
      }

      if (!isOrgVideo && !isOrgVariation) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Key does not belong to this organization" });
      }

      const url = await getSignedUrl(input.key, input.expiresIn);
      return { url };
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
