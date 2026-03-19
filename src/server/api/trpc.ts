import "@/lib/env";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";
import { auth } from "@/server/auth/config";
import { db } from "@/lib/db";
import { checkUsageLimit } from "@/server/services/usage-tracking";
import { checkRateLimit, MUTATION_LIMIT } from "@/lib/rate-limit";

// ── Context ──────────────────────────────────────────────────────

export async function createTRPCContext() {
  const session = await auth();
  return { session, db };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// ── Init ─────────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

// ── Layer 1: Public Procedure ────────────────────────────────────
// No auth required — used for health checks, public API

export const publicProcedure = t.procedure;

// ── Layer 2: Authed Procedure ────────────────────────────────────
// Requires valid NextAuth session — rejects unauthenticated requests

const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }

  // Block users whose org subscription is dead
  if (ctx.session.user.orgBlocked) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your subscription is inactive. Please reactivate.",
      cause: ctx.session.user.blockReason,
    });
  }

  return next({
    ctx: {
      session: ctx.session,
      userId: ctx.session.user.id,
      organizationId: ctx.session.user.organizationId,
      subscriptionStatus: ctx.session.user.subscriptionStatus,
      onboardingStatus: ctx.session.user.onboardingStatus,
      role: ctx.session.user.role,
      features: ctx.session.user.features,
    },
  });
});

// Enriched context after enforceAuth
type AuthedContext = {
  session: NonNullable<Context["session"]>;
  db: Context["db"];
  userId: string;
  organizationId?: string;
  subscriptionStatus?: string;
  onboardingStatus?: string;
  role?: string;
  features?: NonNullable<Context["session"]>["user"]["features"];
};

// ── Rate Limit Middleware ────────────────────────────────────────
// Applied to authed mutations to prevent abuse (60 req/min per user)

const enforceRateLimit = t.middleware(async ({ ctx, type, next }) => {
  if (type === "mutation") {
    const c = ctx as unknown as AuthedContext;
    const key = `user:${c.userId ?? "anon"}`;
    const result = await checkRateLimit(key, MUTATION_LIMIT);
    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please slow down.",
      });
    }
  }
  return next({ ctx });
});

export const authedProcedure = t.procedure.use(enforceAuth).use(enforceRateLimit);

// ── Layer 3: Subscribed Procedure ────────────────────────────────
// Requires ACTIVE or PAUSED subscription — blocks PAST_DUE, CANCELED, etc.

const enforceSubscription = t.middleware(async ({ ctx, next }) => {
  const authedCtx = ctx as unknown as AuthedContext;
  if (!authedCtx.organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No organization found. Complete checkout first.",
    });
  }

  const allowedStatuses = ["ACTIVE", "PAUSED"];

  if (!authedCtx.subscriptionStatus || !allowedStatuses.includes(authedCtx.subscriptionStatus)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Subscription status "${authedCtx.subscriptionStatus}" does not allow access. Please update your billing.`,
    });
  }

  return next({
    ctx: {
      ...authedCtx,
      organizationId: authedCtx.organizationId,
      subscriptionStatus: authedCtx.subscriptionStatus,
    },
  });
});

export const subscribedProcedure = authedProcedure.use(enforceSubscription);

// ── Layer 4: Onboarded Procedure ─────────────────────────────────
// Requires onboardingStatus === ACTIVE
// PENDING_SETUP users are routed to Provisioning UI — they cannot access
// the main dashboard, agents, workflows, or any tool routes

const enforceOnboarded = t.middleware(async ({ ctx, next }) => {
  const c = ctx as unknown as AuthedContext;
  if (c.onboardingStatus !== "ACTIVE") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        c.onboardingStatus === "PENDING_SETUP"
          ? "Your account is being provisioned. Our team is configuring your AI agents."
          : c.onboardingStatus === "PENDING_PAYMENT"
            ? "Please complete payment to continue."
            : "Your account has been suspended. Contact support.",
    });
  }

  return next({ ctx });
});

export const onboardedProcedure = subscribedProcedure.use(enforceOnboarded);

// ── Admin Procedure ──────────────────────────────────────────────
// Requires OWNER or ADMIN role on the org

const enforceAdmin = t.middleware(async ({ ctx, next }) => {
  const c = ctx as unknown as AuthedContext;
  if (!c.role || !["OWNER", "ADMIN"].includes(c.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({ ctx });
});

export const adminProcedure = authedProcedure.use(enforceAdmin);

// ── Tier-Gated Procedure Factory ─────────────────────────────────
// Usage: tierGatedProcedure("multiplierEnabled") or tierGatedProcedure("maxAccounts")
// Boolean gates: checks session features[key] is truthy
// Numeric gates: calls checkUsageLimit() against org usage

type BooleanGate = "mlFeaturesEnabled" | "multiplierEnabled";
type NumericGate = "maxAccounts" | "maxWorkflowRuns" | "maxVideosPerMonth";
type FeatureGate = BooleanGate | NumericGate;

const GATE_TO_METRIC: Record<NumericGate, "accounts" | "workflow_runs" | "videos"> = {
  maxAccounts: "accounts",
  maxWorkflowRuns: "workflow_runs",
  maxVideosPerMonth: "videos",
};

const NUMERIC_GATES = new Set<string>(Object.keys(GATE_TO_METRIC));

export function tierGatedProcedure(feature: FeatureGate) {
  const enforceTierGate = t.middleware(async ({ ctx, next }) => {
    const c = ctx as unknown as AuthedContext;
    if (!c.features) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No feature gates found. Contact support.",
      });
    }

    if (NUMERIC_GATES.has(feature)) {
      const metric = GATE_TO_METRIC[feature as NumericGate];
      const result = await checkUsageLimit(c.organizationId!, metric);
      if (!result.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: result.message ?? `${feature} limit reached (${result.current}/${result.limit}).`,
        });
      }
    } else {
      // Boolean gate
      if (!c.features[feature]) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Feature "${feature}" is not available on your current plan.`,
        });
      }
    }

    return next({ ctx });
  });

  return onboardedProcedure.use(enforceTierGate);
}
