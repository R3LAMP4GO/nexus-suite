import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { generateOAuthState } from "../_lib/oauth-state";
import { getLinkedInCredentials } from "../_lib/platform-credentials";

/**
 * LinkedIn OAuth 2.0
 * @see https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  const { clientId } = await getLinkedInCredentials();
  if (!clientId) {
    return NextResponse.json(
      { error: "LinkedIn OAuth is not configured — LINKEDIN_CLIENT_ID is missing" },
      { status: 503 },
    );
  }

  const state = await generateOAuthState(session.user.organizationId);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/linkedin/callback`,
    scope: "openid profile w_member_social",
    state,
  });

  return NextResponse.redirect(
    `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
  );
}
