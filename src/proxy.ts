import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/auth.config";
import { NextRequest, NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// ── Nonce-based Content-Security-Policy ─────────────────────────
// Generate a per-request nonce and set CSP header to eliminate 'unsafe-inline'/'unsafe-eval'.
// The nonce is forwarded via x-nonce header so server components can read it.
function buildCspHeader(nonce: string): string {
  const sentryOrigin = process.env.NEXT_PUBLIC_SENTRY_DSN
    ? (() => { try { return new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin; } catch { return ""; } })()
    : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${sentryOrigin ? ` ${sentryOrigin}` : ""}`,
    "media-src 'self' blob: https:",
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set("x-nonce", nonce);
  response.headers.set("Content-Security-Policy", buildCspHeader(nonce));
}

// Routes that don't require auth
const PUBLIC_ROUTES = ["/login", "/pricing", "/terms", "/privacy", "/api/webhooks/stripe", "/api/auth", "/api/health"];

// Routes that are part of the onboarding flow — don't redirect away from these
const ONBOARDING_FLOW_ROUTES = ["/onboarding", "/provisioning", "/pricing"];

// Routes only accessible to admins via admin UI (no redirect guards needed)
const ADMIN_ROUTES = ["/admin"];

// ── In-memory rate limiting (Node.js runtime) ───────────────────
// Simple fixed-window limiter. Proxy runs in Node.js runtime (not edge).
// Redis-backed rate limiting runs in API route handlers for persistence.
interface RateLimitEntry { count: number; resetAt: number; }
const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT_CONFIGS: Array<{ prefix: string; limit: number; windowSecs: number }> = [
  { prefix: "/api/auth", limit: 10, windowSecs: 60 },
  { prefix: "/api/oauth", limit: 20, windowSecs: 60 },
  { prefix: "/api/webhooks", limit: 100, windowSecs: 60 },
];

function checkRateLimit(key: string, limit: number, windowSecs: number): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowSecs * 1000;
    rateLimitMap.set(key, { count: 1, resetAt });
    return { allowed: true, resetAt };
  }
  entry.count++;
  return { allowed: entry.count <= limit, resetAt: entry.resetAt };
}

export default auth(async (req) => {
  const nextReq = req as unknown as NextRequest;
  const { pathname } = nextReq.nextUrl;

  // Generate a per-request nonce for CSP
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Helper: NextResponse.next() with CSP headers
  function next(): NextResponse {
    const res = NextResponse.next();
    applySecurityHeaders(res, nonce);
    return res;
  }

  // Helper: NextResponse.redirect() with CSP headers
  function redirect(url: URL): NextResponse {
    const res = NextResponse.redirect(url);
    applySecurityHeaders(res, nonce);
    return res;
  }

  // ── IP-based rate limiting for sensitive endpoints ──────────────
  const rateLimitRoute = RATE_LIMIT_CONFIGS.find((r) => pathname.startsWith(r.prefix));
  if (rateLimitRoute) {
    const ip = nextReq.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const result = checkRateLimit(`ip:${ip}:${rateLimitRoute.prefix}`, rateLimitRoute.limit, rateLimitRoute.windowSecs);
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
  }
  const session = req.auth;

  // Allow public routes
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return next();
  }

  // No session → login
  if (!session?.user) {
    return redirect(new URL("/login", nextReq.url));
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
    return next();
  }

  // API routes — let tRPC handle its own auth/guards
  if (pathname.startsWith("/api")) {
    return next();
  }

  // ── Onboarding state routing ──────────────────────────────────

  // No org yet → send to pricing (unless already there)
  if (!hasOrg && !ONBOARDING_FLOW_ROUTES.some((r) => pathname.startsWith(r))) {
    return redirect(new URL("/pricing", nextReq.url));
  }

  // Subscription blocked → reactivation page
  // INACTIVE = default for new orgs before first payment (see schema default)
  const blockedStatuses = ["CANCELED", "INACTIVE", "UNPAID"];
  if (subscriptionStatus && blockedStatuses.includes(subscriptionStatus)) {
    if (pathname !== "/reactivate" && pathname !== "/suspended") {
      return redirect(new URL("/reactivate", nextReq.url));
    }
    return next();
  }

  // Org is SUSPENDED → suspended page
  if (onboardingStatus === "SUSPENDED") {
    if (pathname !== "/suspended") {
      return redirect(new URL("/suspended", nextReq.url));
    }
    return next();
  }

  // Org is PENDING_PAYMENT → they need to complete checkout
  if (onboardingStatus === "PENDING_PAYMENT") {
    if (!ONBOARDING_FLOW_ROUTES.some((r) => pathname.startsWith(r))) {
      return redirect(new URL("/pricing", nextReq.url));
    }
    return next();
  }

  // Org is PENDING_SETUP → onboarding form or provisioning wait screen
  if (onboardingStatus === "PENDING_SETUP") {
    if (
      !pathname.startsWith("/onboarding") &&
      !pathname.startsWith("/provisioning")
    ) {
      return redirect(new URL("/onboarding", nextReq.url));
    }
    return next();
  }

  // Org is ACTIVE — if they navigate to onboarding/provisioning, redirect to dashboard
  if (onboardingStatus === "ACTIVE") {
    if (ONBOARDING_FLOW_ROUTES.some((r) => pathname.startsWith(r)) && pathname !== "/pricing") {
      return redirect(new URL("/dashboard", nextReq.url));
    }
  }

  return next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|terms|privacy|.*\\..*).*)"],
};
