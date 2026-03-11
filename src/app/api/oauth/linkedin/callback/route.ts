import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { db } from "@/lib/db";
import { storeOAuthTokens } from "../../_lib/store-tokens";

const REDIRECT_BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/login", REDIRECT_BASE));
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  // Validate OAuth state parameter to prevent CSRF attacks
  if (stateParam !== session.user.organizationId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings/connections?error=invalid_state", REDIRECT_BASE),
    );
  }

  if (error || !code) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings/connections?error=${error ?? "no_code"}`,
        REDIRECT_BASE,
      ),
    );
  }

  try {
    const tokenRes = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
          client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
          redirect_uri: `${REDIRECT_BASE}/api/oauth/linkedin/callback`,
        }),
      },
    );

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("[oauth/linkedin] Token exchange failed:", detail);
      return NextResponse.redirect(
        new URL(
          "/dashboard/settings/connections?error=token_exchange",
          REDIRECT_BASE,
        ),
      );
    }

    const tokens = await tokenRes.json();

    const infisicalSecretPath = await storeOAuthTokens(
      session.user.organizationId,
      "LINKEDIN",
      tokens,
    );

    await db.orgPlatformToken.upsert({
      where: {
        organizationId_platform_accountLabel: {
          organizationId: session.user.organizationId,
          platform: "LINKEDIN",
          accountLabel: "Primary LinkedIn",
        },
      },
      update: {
        infisicalSecretPath,
        updatedAt: new Date(),
      },
      create: {
        organizationId: session.user.organizationId,
        platform: "LINKEDIN",
        accountLabel: "Primary LinkedIn",
        accountType: "PRIMARY",
        infisicalSecretPath,
      },
    });

    return NextResponse.redirect(
      new URL(
        "/dashboard/settings/connections?connected=linkedin",
        REDIRECT_BASE,
      ),
    );
  } catch (err) {
    console.error("[oauth/linkedin] Callback error:", err);
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings/connections?error=linkedin_callback",
        REDIRECT_BASE,
      ),
    );
  }
}
