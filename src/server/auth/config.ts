import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { authConfig } from "./auth.config";

const devCredentials =
  process.env.NODE_ENV === "development"
    ? [
        Credentials({
          name: "Dev Login",
          credentials: {
            email: { label: "Email", type: "email" },
          },
          async authorize(credentials) {
            const email = credentials?.email as string;
            if (!email) return null;

            // Find or bootstrap dev user + org
            let user = await db.user.findUnique({ where: { email } });
            if (!user) {
              user = await db.user.create({
                data: {
                  email,
                  name: "Dev Admin",
                  emailVerified: new Date(),
                },
              });

              // Bootstrap org + membership so session callback works
              const org = await db.organization.create({
                data: {
                  name: "Dev Organization",
                  slug: "dev-org",
                  subscriptionStatus: "ACTIVE",
                  onboardingStatus: "ACTIVE",
                  pricingTier: "MULTIPLIER",
                  maxAccounts: 50,
                  maxWorkflowRuns: 1000,
                  maxVideosPerMonth: 500,
                  mlFeaturesEnabled: true,
                  multiplierEnabled: true,
                  dailyLlmBudgetCents: 5000,
                },
              });

              await db.orgMember.create({
                data: {
                  organizationId: org.id,
                  userId: user.id,
                  role: "OWNER",
                },
              });
            }

            return user;
          },
        }),
      ]
    : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db as any),
  session: { strategy: "jwt" },
  providers: [
    ...authConfig.providers,
    Resend({
      apiKey: process.env.RESEND_API_KEY!,
      from: process.env.EMAIL_FROM ?? "Nexus Suite <noreply@nexus-suite.com>",
    }),
    ...devCredentials,
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Gate sign-in: only allow users whose email already exists in the DB
    // (pre-registered by admin). Google OAuth and magic link both pass through here.
    async signIn({ user, account }) {
      if (!user.email) return false;

      const existingUser = await db.user.findUnique({
        where: { email: user.email },
      });

      // First-time Google sign-in: allow if email is pre-registered OR
      // if there are no users yet (first-ever admin bootstrap)
      if (!existingUser) {
        const userCount = await db.user.count();
        if (userCount === 0) return true; // Bootstrap: first user is always allowed
        return "/login?error=NotInvited";
      }

      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) token.id = user.id;

      // Refresh org state on every sign-in and periodically on session update
      const userId = token.id as string | undefined;
      if (userId && (user || trigger === "update")) {
        const membership = await db.orgMember.findFirst({
          where: { userId },
          include: {
            organization: {
              select: {
                onboardingStatus: true,
                subscriptionStatus: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        });
        token.onboardingStatus = membership?.organization.onboardingStatus ?? null;
        token.subscriptionStatus = membership?.organization.subscriptionStatus ?? null;
        token.hasOrg = !!membership;
      }

      return token;
    },
    // Layer 2: Session callback — inject org status into session
    // Blocks login entirely if subscription is CANCELED/INACTIVE
    async session({ session, token, user }) {
      const userId = (token?.id as string | undefined) ?? user?.id;
      if (!userId) return session;
      // Find user's org membership (primary = first OWNER membership)
      const membership = await db.orgMember.findFirst({
        where: { userId },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              subscriptionStatus: true,
              onboardingStatus: true,
              pricingTier: true,
              maxAccounts: true,
              maxWorkflowRuns: true,
              maxVideosPerMonth: true,
              mlFeaturesEnabled: true,
              multiplierEnabled: true,
              dailyLlmBudgetCents: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      session.user.id = userId;

      if (membership) {
        const org = membership.organization;

        // Layer 2 gate: block if subscription is dead
        // INACTIVE = default for new orgs before first payment (see schema default)
        const blockedStatuses = ["CANCELED", "INACTIVE", "UNPAID"];
        if (blockedStatuses.includes(org.subscriptionStatus)) {
          // Return session without org — frontend redirects to /reactivate
          session.user.orgBlocked = true;
          session.user.blockReason = "subscription_inactive";
          return session;
        }

        session.user.organizationId = org.id;
        session.user.organizationName = org.name;
        session.user.organizationSlug = org.slug;
        session.user.role = membership.role;
        session.user.subscriptionStatus = org.subscriptionStatus;
        session.user.onboardingStatus = org.onboardingStatus;
        session.user.pricingTier = org.pricingTier;

        // Denormalized feature gates for client-side checks
        session.user.features = {
          maxAccounts: org.maxAccounts,
          maxWorkflowRuns: org.maxWorkflowRuns,
          maxVideosPerMonth: org.maxVideosPerMonth,
          mlFeaturesEnabled: org.mlFeaturesEnabled,
          multiplierEnabled: org.multiplierEnabled,
          dailyLlmBudgetCents: org.dailyLlmBudgetCents,
        };
      }

      return session;
    },
  },
});

// ── Type Augmentation ────────────────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      organizationId?: string;
      organizationName?: string;
      organizationSlug?: string;
      role?: string;
      subscriptionStatus?: string;
      onboardingStatus?: string;
      pricingTier?: string;
      orgBlocked?: boolean;
      blockReason?: string;
      features?: {
        maxAccounts: number;
        maxWorkflowRuns: number;
        maxVideosPerMonth: number;
        mlFeaturesEnabled: boolean;
        multiplierEnabled: boolean;
        dailyLlmBudgetCents: number;
      };
    };
  }
}
