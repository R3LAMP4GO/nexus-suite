import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/auth.config";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, AUTH_LIMIT, OAUTH_LIMIT, WEBHOOK_LIMIT } from "@/lib/rate-limit";

const { auth } = NextAuth(authConfig);

// Routes that don't require auth
const PUBLIC_ROUTES = ["/login", "/pricing", "/terms", "/privacy", "/api/webhooks/stripe", "/api/auth", "/api/health"];

// Routes that are part of the onboarding flow — don't redirect away from these
const ONBOARDING_FLOW_ROUTES = ["/onboarding", "/provisioning", "/pricing"];

// Routes only accessible to admins via admin UI (no redirect guards needed)
const ADMIN_ROUTES = ["/admin"];

// ── Rate-limited route patterns ─────────────────────────────────
const RATE_LIMITED_ROUTES: Array<{ prefix: string; config: typeof AUTH_LIMIT }> = [
  { prefix: "/api/auth", config: AUTH_LIMIT },
  { prefix: "/api/oauth", config: OAUTH_LIMIT },
  { prefix: "/api/webhooks", config: WEBHOOK_LIMIT },
];

export default auth(async (req) => {
  const nextReq = req as unknown as NextRequest;
  const { pathname } = nextReq.nextUrl;

  // ── IP-based rate limiting for sensitive endpoints ──────────────
  const rateLimitRoute = RATE_LIMITED_ROUTES.find((r) => pathname.startsWith(r.prefix));
  if (rateLimitRoute) {
    const ip = nextReq.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    try {
      const result = await checkRateLimit(`ip:${ip}:${rateLimitRoute.prefix}`, rateLimitRoute.config);
      if (!result.allowed) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            },
          },
        );
      }
    } catch {
      // Redis down — fail open to avoid blocking all requests
    }
  }
  const session = req.auth;

  // Allow public routes
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // No session → login
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", nextReq.url));
  }

  // Extract onboarding state from JWT token
  // These fields are set in the jwt callback in src/server/auth/config.ts
  const token = session as unknown as {
    user: typeof session.user;
    onboardingStatus?: string | null;
    subscriptionStatus?: string | null;
    hasOrg?: boolean;
  };

  const onboardingStatus = token.onboardingStatus ?? session.user?.onboardingStatus;
  const subscriptionStatus = token.subscriptionStatus ?? session.user?.subscriptionStatus;
  const hasOrg = token.hasOrg ?? !!session.user?.organizationId;

  // Admin routes — no onboarding redirects
  if (ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // API routes — let tRPC handle its own auth/guards
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // ── Onboarding state routing ──────────────────────────────────

  // No org yet → send to pricing (unless already there)
  if (!hasOrg && !ONBOARDING_FLOW_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL("/pricing", nextReq.url));
  }

  // Subscription blocked → reactivation page
  // INACTIVE = default for new orgs before first payment (see schema default)
  const blockedStatuses = ["CANCELED", "INACTIVE", "UNPAID"];
  if (subscriptionStatus && blockedStatuses.includes(subscriptionStatus)) {
    if (pathname !== "/reactivate" && pathname !== "/suspended") {
      return NextResponse.redirect(new URL("/reactivate", nextReq.url));
    }
    return NextResponse.next();
  }

  // Org is SUSPENDED → suspended page
  if (onboardingStatus === "SUSPENDED") {
    if (pathname !== "/suspended") {
      return NextResponse.redirect(new URL("/suspended", nextReq.url));
    }
    return NextResponse.next();
  }

  // Org is PENDING_PAYMENT → they need to complete checkout
  if (onboardingStatus === "PENDING_PAYMENT") {
    if (!ONBOARDING_FLOW_ROUTES.some((r) => pathname.startsWith(r))) {
      return NextResponse.redirect(new URL("/pricing", nextReq.url));
    }
    return NextResponse.next();
  }

  // Org is PENDING_SETUP → onboarding form or provisioning wait screen
  if (onboardingStatus === "PENDING_SETUP") {
    if (
      !pathname.startsWith("/onboarding") &&
      !pathname.startsWith("/provisioning")
    ) {
      return NextResponse.redirect(new URL("/onboarding", nextReq.url));
    }
    return NextResponse.next();
  }

  // Org is ACTIVE — if they navigate to onboarding/provisioning, redirect to dashboard
  if (onboardingStatus === "ACTIVE") {
    if (ONBOARDING_FLOW_ROUTES.some((r) => pathname.startsWith(r)) && pathname !== "/pricing") {
      return NextResponse.redirect(new URL("/dashboard", nextReq.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|terms|privacy|.*\\..*).*)"],
};
