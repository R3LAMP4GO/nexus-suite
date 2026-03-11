import { z } from "zod";
import { createTRPCRouter, onboardedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Platform } from "@/generated/prisma/client";
import { getBoss } from "@/lib/pg-boss";

const COMPETITOR_QUEUE = "competitor:task";

// ── Helpers ─────────────────────────────────────────────────────

const PLATFORM_PATTERNS: Record<string, Platform> = {
  "youtube.com": "YOUTUBE",
  "youtu.be": "YOUTUBE",
  "tiktok.com": "TIKTOK",
  "instagram.com": "INSTAGRAM",
  "linkedin.com": "LINKEDIN",
  "x.com": "X",
  "twitter.com": "X",
  "facebook.com": "FACEBOOK",
};

function parseProfileUrl(profileUrl: string): { platform: Platform; username: string } {
  let url: URL;
  try {
    url = new URL(profileUrl);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid URL" });
  }

  const hostname = url.hostname.replace(/^www\./, "");
  const platform = PLATFORM_PATTERNS[hostname];
  if (!platform) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported platform: ${hostname}`,
    });
  }

  // Extract username from path: /@user, /user, /c/user, /in/user
  const segments = url.pathname.split("/").filter(Boolean);
  let username = segments.at(-1) ?? "";
  username = username.replace(/^@/, "");

  if (!username) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Could not extract username from URL" });
  }

  return { platform, username };
}

// ── Router ──────────────────────────────────────────────────────

export const competitorsRouter = createTRPCRouter({
  addCreator: onboardedProcedure
    .input(z.object({ profileUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const { platform, username } = parseProfileUrl(input.profileUrl);

      const creator = await ctx.db.trackedCreator.create({
        data: {
          organizationId: ctx.organizationId,
          platform,
          username,
          profileUrl: input.profileUrl,
        },
      });

      // TODO: queue scraper-pool job for profile extraction (Chunk 3)

      return creator;
    }),

  listCreators: onboardedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit = 25 } = input ?? {};

      const creators = await ctx.db.trackedCreator.findMany({
        where: { organizationId: ctx.organizationId },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { posts: true } },
        },
      });

      let nextCursor: string | undefined;
      if (creators.length > limit) {
        const next = creators.pop();
        nextCursor = next?.id;
      }

      return { creators, nextCursor };
    }),

  toggleAutoReproduce: onboardedProcedure
    .input(z.object({ creatorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const creator = await ctx.db.trackedCreator.findFirst({
        where: { id: input.creatorId, organizationId: ctx.organizationId },
      });

      if (!creator) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Creator not found" });
      }

      return ctx.db.trackedCreator.update({
        where: { id: input.creatorId },
        data: { autoReproduce: !creator.autoReproduce },
      });
    }),

  setThreshold: onboardedProcedure
    .input(z.object({ creatorId: z.string(), threshold: z.number().min(0.1).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const creator = await ctx.db.trackedCreator.findFirst({
        where: { id: input.creatorId, organizationId: ctx.organizationId },
      });

      if (!creator) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Creator not found" });
      }

      return ctx.db.trackedCreator.update({
        where: { id: input.creatorId },
        data: { outlierThreshold: input.threshold },
      });
    }),

  getCreatorPosts: onboardedProcedure
    .input(
      z.object({
        creatorId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify creator belongs to org
      const creator = await ctx.db.trackedCreator.findFirst({
        where: { id: input.creatorId, organizationId: ctx.organizationId },
      });

      if (!creator) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Creator not found" });
      }

      const posts = await ctx.db.trackedPost.findMany({
        where: { creatorId: input.creatorId },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { publishedAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (posts.length > input.limit) {
        const next = posts.pop();
        nextCursor = next?.id;
      }

      return { posts, nextCursor };
    }),

  analyzePost: onboardedProcedure
    .input(z.object({ postId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.db.trackedPost.findFirst({
        where: {
          id: input.postId,
          creator: { organizationId: ctx.organizationId },
        },
      });

      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      if (!post.url) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Post has no URL — cannot analyze" });
      }

      const b = await getBoss();
      await b.send(COMPETITOR_QUEUE, {
        jobType: "analyze" as const,
        postId: post.id,
        url: post.url,
        organizationId: ctx.organizationId,
      });

      return { queued: true, postId: input.postId };
    }),

  reproducePost: onboardedProcedure
    .input(z.object({ postId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const post = await ctx.db.trackedPost.findFirst({
        where: {
          id: input.postId,
          creator: { organizationId: ctx.organizationId },
        },
      });

      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }

      if (!post.url) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Post has no URL — cannot reproduce" });
      }

      const b = await getBoss();
      await b.send(COMPETITOR_QUEUE, {
        jobType: "reproduce" as const,
        postId: post.id,
        url: post.url,
        organizationId: ctx.organizationId,
      });

      return { queued: true, postId: input.postId };
    }),
});
