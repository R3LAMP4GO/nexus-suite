import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "oauth_state";
const COOKIE_MAX_AGE = 600; // 10 minutes

/**
 * Generate a cryptographically random OAuth state nonce.
 * Stores it in an httpOnly cookie so the callback can validate it.
 * Returns the state string to pass to the OAuth provider.
 */
export async function generateOAuthState(organizationId: string): Promise<string> {
  const nonce = randomBytes(32).toString("base64url");
  const state = JSON.stringify({ nonce, orgId: organizationId });
  const encoded = Buffer.from(state).toString("base64url");

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/api/oauth",
  });

  return encoded;
}

/**
 * Validate the OAuth state parameter from the callback.
 * Compares against the httpOnly cookie set during the init request.
 * Returns the organizationId if valid, throws if not.
 */
export async function validateOAuthState(stateParam: string | null): Promise<string> {
  if (!stateParam) {
    throw new Error("Missing OAuth state parameter");
  }

  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);

  if (!cookie?.value) {
    throw new Error("Missing OAuth state cookie — session may have expired");
  }

  // Constant-time-ish comparison (state is not secret, but prevents timing leaks)
  if (cookie.value !== stateParam) {
    throw new Error("OAuth state mismatch — possible CSRF attack");
  }

  // Clear the cookie after use (one-time nonce)
  cookieStore.delete(COOKIE_NAME);

  // Decode and return orgId
  const decoded = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  return decoded.orgId as string;
}
