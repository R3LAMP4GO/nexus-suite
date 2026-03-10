import { storeSecret } from "@/lib/infisical";

const PROJECT_ID = process.env.INFISICAL_PROJECT_ID ?? "";
const ENV = process.env.INFISICAL_ENV ?? "production";

/**
 * Store OAuth tokens in Infisical using the fetch-use-discard pattern.
 * DB only stores the secret path reference, never raw tokens.
 *
 * @returns The Infisical secret path (stored on OrgPlatformToken.infisicalSecretPath)
 */
export async function storeOAuthTokens(
  organizationId: string,
  platform: string,
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  },
): Promise<string> {
  const secretPath = `/orgs/${organizationId}/tokens/${platform.toLowerCase()}-primary`;

  await storeSecret(PROJECT_ID, ENV, secretPath, "access_token", tokens.access_token);

  if (tokens.refresh_token) {
    await storeSecret(PROJECT_ID, ENV, secretPath, "refresh_token", tokens.refresh_token);
  }

  if (tokens.expires_in !== undefined) {
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await storeSecret(PROJECT_ID, ENV, secretPath, "expires_at", expiresAt);
  }

  if (tokens.token_type) {
    await storeSecret(PROJECT_ID, ENV, secretPath, "token_type", tokens.token_type);
  }

  if (tokens.scope) {
    await storeSecret(PROJECT_ID, ENV, secretPath, "scope", tokens.scope);
  }

  return secretPath;
}
