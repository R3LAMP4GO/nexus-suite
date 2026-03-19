import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { sendActivationEmail } from "@/server/services/notifications";

// ── System health check helpers ───────────────────────────────────

interface HealthEntry {
  name: string;
  key: string;
  configured: boolean;
}

function checkEnvVar(name: string, key: string): HealthEntry {
  return { name, key, configured: !!process.env[key] };
}

export const adminRouter = createTRPCRouter({
  // ── Organizations ─────────────────────────────────────────────

  // List all orgs with status info for admin data table
  listOrgs: adminProcedure
    .input(
      z
        .object({
          cursor: z.string().optional(),
          limit: z.number().min(1).max(100).default(25),
          statusFilter: z.enum(["ALL", "PENDING_SETUP", "ACTIVE", "SUSPENDED"]).default("ALL"),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit = 25, statusFilter = "ALL" } = input ?? {};

      const where =
        statusFilter !== "ALL" ? { onboardingStatus: statusFilter as any } : {};

      const orgs = await ctx.db.organization.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          members: {
            where: { role: "OWNER" },
            include: { user: { select: { email: true, name: true } } },
            take: 1,
          },
          onboardingSubmission: {
            select: { niche: true, submittedAt: true },
          },
          _count: { select: { platformTokens: true } },
        },
      });

      let nextCursor: string | undefined;
      if (orgs.length > limit) {
        const next = orgs.pop();
        nextCursor = next?.id;
      }

      return {
        orgs: orgs.map((org) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          ownerEmail: org.members[0]?.user.email ?? "—",
          ownerName: org.members[0]?.user.name ?? "—",
          pricingTier: org.pricingTier,
          subscriptionStatus: org.subscriptionStatus,
          onboardingStatus: org.onboardingStatus,
          niche: org.onboardingSubmission?.niche ?? "—",
          onboardingSubmittedAt: org.onboardingSubmission?.submittedAt ?? null,
          accountCount: org._count.platformTokens,
          createdAt: org.createdAt,
        })),
        nextCursor,
      };
    }),

  // Toggle onboardingStatus: PENDING_SETUP → ACTIVE (or ACTIVE → SUSPENDED)
  setOnboardingStatus: adminProcedure
    .input(
      z.object({
        orgId: z.string(),
        status: z.enum(["ACTIVE", "SUSPENDED", "PENDING_SETUP"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.findUnique({
        where: { id: input.orgId },
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      // Guard: can't activate without onboarding submission
      if (input.status === "ACTIVE" && !org.onboardingStatus) {
        const submission = await ctx.db.onboardingSubmission.findUnique({
          where: { organizationId: input.orgId },
        });
        if (!submission) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot activate — client hasn't submitted onboarding form yet",
          });
        }
      }

      await ctx.db.organization.update({
        where: { id: input.orgId },
        data: { onboardingStatus: input.status },
      });

      // Send activation email when transitioning to ACTIVE
      if (input.status === "ACTIVE" && org.onboardingStatus !== "ACTIVE") {
        const owner = await ctx.db.orgMember.findFirst({
          where: { organizationId: input.orgId, role: "OWNER" },
          include: { user: { select: { email: true } } },
        });
        if (owner?.user.email) {
          // Fire-and-forget — don't block the admin response on email delivery
          sendActivationEmail(owner.user.email, org.name).catch((err) => {
            console.error("[admin] Failed to send activation email:", err);
          });
        }
      }

      return { success: true, orgId: input.orgId, newStatus: input.status };
    }),

  // ── Users ─────────────────────────────────────────────────────

  listAllUsers: adminProcedure
    .input(
      z
        .object({
          cursor: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit = 50, search } = input ?? {};
      const callerOrgId = ctx.session!.user.organizationId;

      // Scope to users who have a membership in the caller's org
      const baseFilter = callerOrgId
        ? { memberships: { some: { organizationId: callerOrgId } } }
        : {};

      const where = search
        ? {
            ...baseFilter,
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : baseFilter;

      const users = await ctx.db.user.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          memberships: {
            // Only return memberships for the caller's org
            where: callerOrgId ? { organizationId: callerOrgId } : undefined,
            select: {
              id: true,
              role: true,
              organization: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (users.length > limit) {
        const next = users.pop();
        nextCursor = next?.id;
      }

      return {
        users: users.map((u) => ({
          id: u.id,
          name: u.name ?? "—",
          email: u.email,
          image: u.image,
          createdAt: u.createdAt,
          memberships: u.memberships.map((m) => ({
            membershipId: m.id,
            role: m.role,
            orgId: m.organization.id,
            orgName: m.organization.name,
            orgSlug: m.organization.slug,
          })),
        })),
        nextCursor,
      };
    }),

  updateUserRole: adminProcedure
    .input(
      z.object({
        membershipId: z.string(),
        role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.orgMember.findUnique({
        where: { id: input.membershipId },
      });

      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Membership not found" });
      }

      // Ensure the caller can only modify memberships within their own org
      if (membership.organizationId !== ctx.session!.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot modify memberships outside your organization" });
      }

      await ctx.db.orgMember.update({
        where: { id: input.membershipId },
        data: { role: input.role },
      });

      return { success: true, membershipId: input.membershipId, newRole: input.role };
    }),

  suspendUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        action: z.enum(["SUSPEND", "RESTORE"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const callerOrgId = ctx.session!.user.organizationId;
      if (!callerOrgId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No organization context" });
      }

      // Verify the target user belongs to the caller's org
      const membership = await ctx.db.orgMember.findFirst({
        where: { userId: input.userId, organizationId: callerOrgId },
      });

      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found in your organization" });
      }

      if (input.action === "SUSPEND") {
        // Remove membership from the caller's org only — not all orgs
        await ctx.db.orgMember.deleteMany({
          where: { userId: input.userId, organizationId: callerOrgId },
        });
        // Delete active sessions to force immediate logout
        await ctx.db.session.deleteMany({
          where: { userId: input.userId },
        });
        return { success: true, userId: input.userId, action: "SUSPENDED" as const };
      }

      // RESTORE: no-op at membership level — admin must re-add user to orgs manually
      return { success: true, userId: input.userId, action: "RESTORED" as const };
    }),

  // ── User Invitations ───────────────────────────────────────────

  inviteUser: adminProcedure
    .input(
      z.object({
        email: z.email(),
        name: z.string().optional(),
        role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Always invite into the caller's org — never allow arbitrary org targeting
      const callerOrgId = ctx.session!.user.organizationId;
      if (!callerOrgId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No organization context" });
      }

      // Check if user already exists
      const existing = await ctx.db.user.findUnique({
        where: { email: input.email },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with this email already exists",
        });
      }

      // Pre-create the user record — this whitelists their email for sign-in
      const user = await ctx.db.user.create({
        data: {
          email: input.email,
          name: input.name ?? null,
        },
      });

      // Add them to the caller's org
      await ctx.db.orgMember.create({
        data: {
          userId: user.id,
          organizationId: callerOrgId,
          role: input.role,
        },
      });

      return { success: true, userId: user.id, email: input.email };
    }),

  // ── System Health ─────────────────────────────────────────────

  getSystemHealth: adminProcedure.query(async ({ ctx }) => {
    const checks: HealthEntry[] = [
      checkEnvVar("Zhipu AI (GLM) API", "ZHIPU_API_KEY"),
      checkEnvVar("Stripe Secret", "STRIPE_SECRET_KEY"),
      checkEnvVar("Stripe Webhook Secret", "STRIPE_WEBHOOK_SECRET"),
      checkEnvVar("Infisical Client ID", "INFISICAL_CLIENT_ID"),
      checkEnvVar("Infisical Client Secret", "INFISICAL_CLIENT_SECRET"),
      checkEnvVar("Cloudflare R2 Access Key", "R2_ACCESS_KEY_ID"),
      checkEnvVar("Cloudflare R2 Secret Key", "R2_SECRET_ACCESS_KEY"),
      checkEnvVar("Cloudflare R2 Bucket", "R2_BUCKET_NAME"),
      checkEnvVar("IPRoyal API Key", "IPROYAL_API_KEY"),
      checkEnvVar("Database URL", "DATABASE_URL"),
      checkEnvVar("Redis URL", "REDIS_URL"),
      checkEnvVar("Auth Secret", "AUTH_SECRET"),
    ];

    // Quick DB ping
    let dbConnected = false;
    try {
      await ctx.db.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    return {
      checks,
      dbConnected,
      timestamp: new Date().toISOString(),
    };
  }),
});
