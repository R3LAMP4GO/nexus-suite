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
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/dashboard/settings/connections?error=${error ?? "no_code"}`, REDIRECT_BASE),
    );
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID ?? "",
        client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET ?? "",
        redirect_uri: `${REDIRECT_BASE}/api/oauth/youtube/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("[oauth/youtube] Token exchange failed:", detail);
      return NextResponse.redirect(
        new URL("/dashboard/settings/connections?error=token_exchange", REDIRECT_BASE),
      );
    }

    const tokens = await tokenRes.json();

    // Store tokens in Infisical — DB stores only the secret path reference
    const infisicalSecretPath = await storeOAuthTokens(
      session.user.organizationId,
      "YOUTUBE",
      tokens,
    );

    await db.orgPlatformToken.upsert({
      where: {
        organizationId_platform_accountLabel: {
          organizationId: session.user.organizationId,
          platform: "YOUTUBE",
          accountLabel: "Primary YouTube",
        },
      },
      update: {
        infisicalSecretPath,
        updatedAt: new Date(),
      },
      create: {
        organizationId: session.user.organizationId,
        platform: "YOUTUBE",
        accountLabel: "Primary YouTube",
        accountType: "PRIMARY",
        infisicalSecretPath,
      },
    });

    return NextResponse.redirect(
      new URL("/dashboard/settings/connections?connected=youtube", REDIRECT_BASE),
    );
  } catch (err) {
    console.error("[oauth/youtube] Callback error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/settings/connections?error=youtube_callback", REDIRECT_BASE),
    );
  }
}
