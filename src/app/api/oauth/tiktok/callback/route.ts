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
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
        redirect_uri: `${REDIRECT_BASE}/api/oauth/tiktok/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("[oauth/tiktok] Token exchange failed:", detail);
      return NextResponse.redirect(
        new URL("/dashboard/settings/connections?error=token_exchange", REDIRECT_BASE),
      );
    }

    const tokens = await tokenRes.json();

    // Store tokens in Infisical — DB stores only the secret path reference
    const infisicalSecretPath = await storeOAuthTokens(
      session.user.organizationId,
      "TIKTOK",
      tokens,
    );

    await db.orgPlatformToken.upsert({
      where: {
        organizationId_platform_accountLabel: {
          organizationId: session.user.organizationId,
          platform: "TIKTOK",
          accountLabel: "Primary TikTok",
        },
      },
      update: {
        infisicalSecretPath,
        updatedAt: new Date(),
      },
      create: {
        organizationId: session.user.organizationId,
        platform: "TIKTOK",
        accountLabel: "Primary TikTok",
        accountType: "PRIMARY",
        infisicalSecretPath,
      },
    });

    return NextResponse.redirect(
      new URL("/dashboard/settings/connections?connected=tiktok", REDIRECT_BASE),
    );
  } catch (err) {
    console.error("[oauth/tiktok] Callback error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/settings/connections?error=tiktok_callback", REDIRECT_BASE),
    );
  }
}
