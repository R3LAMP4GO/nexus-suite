import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
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

  // PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // Encode org ID + verifier in state so callback can use both
  const state = Buffer.from(
    JSON.stringify({ orgId: session.user.organizationId, cv: codeVerifier }),
  ).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID ?? "",
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/x/callback`,
    scope: "tweet.read tweet.write users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return NextResponse.redirect(
    `https://twitter.com/i/oauth2/authorize?${params.toString()}`,
  );
}
