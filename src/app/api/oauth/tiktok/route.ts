import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { generateOAuthState } from "../_lib/oauth-state";
import { getTikTokCredentials } from "../_lib/platform-credentials";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  const { clientKey } = await getTikTokCredentials();
  if (!clientKey) {
    return NextResponse.json(
      { error: "TikTok OAuth is not configured — TIKTOK_CLIENT_KEY is missing" },
      { status: 503 },
    );
  }

  const state = await generateOAuthState(session.user.organizationId);

  const params = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/tiktok/callback`,
    response_type: "code",
    scope: "user.info.basic,video.upload,video.publish",
    state,
  });

  return NextResponse.redirect(
    `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`,
  );
}
