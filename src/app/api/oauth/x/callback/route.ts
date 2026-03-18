import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/server/auth/config";
import { validateOAuthState } from "../../_lib/oauth-state";
import { db } from "@/lib/db";
import { storeOAuthTokens } from "../../_lib/store-tokens";
import { getXCredentials } from "../../_lib/platform-credentials";

const REDIRECT_BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const X_REDIRECT_BASE = process.env.X_OAUTH_REDIRECT_BASE ?? REDIRECT_BASE;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/login", REDIRECT_BASE));
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings/connections?error=${error ?? "no_code"}`,
        REDIRECT_BASE,
      ),
    );
  }

  // Validate CSRF state
  try {
    await validateOAuthState(stateParam);
  } catch {
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings/connections?error=invalid_state",
        REDIRECT_BASE,
      ),
    );
  }

  // Retrieve PKCE verifier from cookie
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("x_code_verifier")?.value;
  cookieStore.delete("x_code_verifier");

  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings/connections?error=missing_verifier",
        REDIRECT_BASE,
      ),
    );
  }

  try {
    // X OAuth 2.0 token exchange with PKCE
    const { clientId: xClientId, clientSecret: xClientSecret } = await getXCredentials();
    const basicAuth = Buffer.from(
      `${xClientId}:${xClientSecret}`,
    ).toString("base64");

    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: `${X_REDIRECT_BASE}/api/oauth/x/callback`,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("[oauth/x] Token exchange failed:", detail);
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
      "X",
      tokens,
    );

    await db.orgPlatformToken.upsert({
      where: {
        organizationId_platform_accountLabel: {
          organizationId: session.user.organizationId,
          platform: "X",
          accountLabel: "Primary X",
        },
      },
      update: {
        infisicalSecretPath,
        updatedAt: new Date(),
      },
      create: {
        organizationId: session.user.organizationId,
        platform: "X",
        accountLabel: "Primary X",
        accountType: "PRIMARY",
        infisicalSecretPath,
      },
    });

    return NextResponse.redirect(
      new URL("/dashboard/settings/connections?connected=x", REDIRECT_BASE),
    );
  } catch (err) {
    console.error("[oauth/x] Callback error:", err);
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings/connections?error=x_callback",
        REDIRECT_BASE,
      ),
    );
  }
}
