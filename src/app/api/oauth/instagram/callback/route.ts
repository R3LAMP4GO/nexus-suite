import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { db } from "@/lib/db";
import { storeOAuthTokens } from "../../_lib/store-tokens";
import { validateOAuthState } from "../../_lib/oauth-state";

const REDIRECT_BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/login", REDIRECT_BASE));
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  // Validate OAuth state nonce to prevent CSRF attacks
  try {
    await validateOAuthState(stateParam);
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/settings/connections?error=invalid_state", REDIRECT_BASE),
    );
  }

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/dashboard/settings/connections?error=${error ?? "no_code"}`, REDIRECT_BASE),
    );
  }

  try {
    const params = new URLSearchParams({
      code,
      client_id: process.env.INSTAGRAM_APP_ID ?? "",
      client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
      redirect_uri: `${REDIRECT_BASE}/api/oauth/instagram/callback`,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`,
    );

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("[oauth/instagram] Token exchange failed:", detail);
      return NextResponse.redirect(
        new URL("/dashboard/settings/connections?error=token_exchange", REDIRECT_BASE),
      );
    }

    const tokens = await tokenRes.json();

    // Store tokens in Infisical — DB stores only the secret path reference
    const infisicalSecretPath = await storeOAuthTokens(
      session.user.organizationId,
      "INSTAGRAM",
      tokens,
    );

    await db.orgPlatformToken.upsert({
      where: {
        organizationId_platform_accountLabel: {
          organizationId: session.user.organizationId,
          platform: "INSTAGRAM",
          accountLabel: "Primary Instagram",
        },
      },
      update: {
        infisicalSecretPath,
        updatedAt: new Date(),
      },
      create: {
        organizationId: session.user.organizationId,
        platform: "INSTAGRAM",
        accountLabel: "Primary Instagram",
        accountType: "PRIMARY",
        infisicalSecretPath,
      },
    });

    return NextResponse.redirect(
      new URL("/dashboard/settings/connections?connected=instagram", REDIRECT_BASE),
    );
  } catch (err) {
    console.error("[oauth/instagram] Callback error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/settings/connections?error=instagram_callback", REDIRECT_BASE),
    );
  }
}
