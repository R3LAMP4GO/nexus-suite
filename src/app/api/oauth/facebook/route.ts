import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { generateOAuthState } from "../_lib/oauth-state";
import { getFacebookCredentials } from "../_lib/platform-credentials";

/**
 * Facebook OAuth 2.0 (for Facebook Pages publishing)
 * Uses the same Meta app as Instagram but with different scopes.
 * @see https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  const { clientId } = await getFacebookCredentials();
  if (!clientId) {
    return NextResponse.json(
      { error: "Facebook OAuth is not configured — FACEBOOK_APP_ID is missing" },
      { status: 503 },
    );
  }

  const state = await generateOAuthState(session.user.organizationId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/facebook/callback`,
    response_type: "code",
    scope:
      "pages_manage_posts,pages_read_engagement,pages_show_list,pages_read_user_content",
    state,
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`,
  );
}
