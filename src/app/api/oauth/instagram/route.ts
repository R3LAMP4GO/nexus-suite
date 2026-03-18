import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { generateOAuthState } from "../_lib/oauth-state";
import { getInstagramCredentials } from "../_lib/platform-credentials";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  const { clientId } = await getInstagramCredentials();
  if (!clientId) {
    return NextResponse.json(
      { error: "Instagram OAuth is not configured — INSTAGRAM_APP_ID is missing" },
      { status: 503 },
    );
  }

  const state = await generateOAuthState(session.user.organizationId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/instagram/callback`,
    response_type: "code",
    scope: "instagram_basic,instagram_content_publish,pages_show_list",
    state,
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`,
  );
}
