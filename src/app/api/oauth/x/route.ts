import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/server/auth/config";
import { generateOAuthState } from "../_lib/oauth-state";
import crypto from "crypto";

/**
 * X (Twitter) OAuth 2.0 with PKCE
 * @see https://developer.x.com/en/docs/authentication/oauth-2-0/authorization-code
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "X OAuth is not configured — X_CLIENT_ID is missing" },
      { status: 503 },
    );
  }

  const state = await generateOAuthState(session.user.organizationId);

  // PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // Store verifier in httpOnly cookie for the callback
  const cookieStore = await cookies();
  cookieStore.set("x_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/oauth/x",
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${process.env.X_OAUTH_REDIRECT_BASE ?? process.env.NEXTAUTH_URL}/api/oauth/x/callback`,
    scope: "tweet.read tweet.write users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return NextResponse.redirect(
    `https://twitter.com/i/oauth2/authorize?${params.toString()}`,
  );
}
