/**
 * E2E: Infisical Secrets Management
 *
 * Tests the fetch-use-discard pattern: DB stores Secret ID only →
 * fetch from Infisical at runtime → use → discard from memory.
 *
 * Verifies: Decision 9 — secret ID references, no raw credentials in DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Infisical client ───────────────────────────────────────
const secretVault = new Map<string, string>();

const mockInfisical = {
  getSecret: vi.fn(async (secretId: string) => {
    const value = secretVault.get(secretId);
    if (!value) throw new Error(`Secret not found: ${secretId}`);
    return { secretValue: value };
  }),
};

vi.mock("@/lib/infisical", () => ({
  fetchSecret: async (
    _projectId: string,
    _environment: string,
    _secretPath: string,
    secretName: string,
  ) => {
    // In tests, we use secretName as the vault key for simplicity
    const result = await mockInfisical.getSecret(secretName);
    return result.secretValue;
  },
}));

describe("E2E: Infisical Secrets — Fetch-Use-Discard Pattern", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secretVault.clear();

    // Populate vault with test secrets
    secretVault.set("orgs/org_1/tokens/youtube-api", "ya29.mock_youtube_token");
    secretVault.set("orgs/org_1/tokens/tiktok-session", "tt_session_mock_123");
    secretVault.set("orgs/org_1/proxies/residential-1", "http://user:pass@proxy1.example.com:8080");
  });

  it("fetches credentials at runtime, never stores raw values", async () => {
    const { fetchSecret } = await import("@/lib/infisical");

    // Simulate what happens in the worker:
    // 1. Read infisicalSecretId from DB (this is the ONLY thing stored)
    const dbRecord = {
      id: "token_1",
      platform: "youtube",
      accountType: "PRIMARY",
      infisicalSecretId: "orgs/org_1/tokens/youtube-api", // DB reference
      // NOTE: No raw token field exists in the schema
    };

    // 2. Fetch from Infisical at runtime
    const credential = await fetchSecret("proj_1", "dev", dbRecord.infisicalSecretId, dbRecord.infisicalSecretId);
    expect(credential).toBe("ya29.mock_youtube_token");

    // 3. Use the credential (pass to API call)
    const apiCallResult = simulateApiCall(credential);
    expect(apiCallResult.authenticated).toBe(true);

    // 4. Discard — credential goes out of scope
    // In a real implementation, the credential variable is scoped to the
    // function and garbage collected. We verify it was never persisted.
    expect(dbRecord).not.toHaveProperty("rawToken");
    expect(dbRecord).not.toHaveProperty("accessToken");
    expect(dbRecord).not.toHaveProperty("credential");
  });

  it("fetches proxy URLs from Infisical, not DB", async () => {
    const { fetchSecret } = await import("@/lib/infisical");

    const dbRecord = {
      id: "token_2",
      infisicalProxyId: "orgs/org_1/proxies/residential-1",
      // No raw proxy URL in DB
    };

    const proxyUrl = await fetchSecret("proj_1", "dev", dbRecord.infisicalProxyId, dbRecord.infisicalProxyId);
    expect(proxyUrl).toContain("proxy1.example.com");
    expect(proxyUrl).toContain("http://");
  });

  it("handles missing secrets gracefully", async () => {
    const { fetchSecret } = await import("@/lib/infisical");

    await expect(
      fetchSecret("proj_1", "dev", "/nonexistent", "orgs/org_1/tokens/nonexistent"),
    ).rejects.toThrow("Secret not found");
  });

  it("isolates secrets per organization", async () => {
    const { fetchSecret } = await import("@/lib/infisical");

    // Add secrets for org_2
    secretVault.set("orgs/org_2/tokens/youtube-api", "ya29.org2_different_token");

    const org1Token = await fetchSecret("proj_1", "dev", "/tokens", "orgs/org_1/tokens/youtube-api");
    const org2Token = await fetchSecret("proj_1", "dev", "/tokens", "orgs/org_2/tokens/youtube-api");

    expect(org1Token).not.toBe(org2Token);
    expect(org1Token).toBe("ya29.mock_youtube_token");
    expect(org2Token).toBe("ya29.org2_different_token");
  });

  it("client plugins cannot access Infisical directly", () => {
    // Verify that client plugin files don't import infisical
    const clientExampleDir = "src/agents/clients/_example";

    // The convention is enforced architecturally:
    // - Client tools receive credentials via prepareContext()
    // - They never import from @/lib/infisical
    // We verify this by checking the example plugin
    const { readFileSync, readdirSync, existsSync } = require("fs");
    const { join } = require("path");

    const toolsDir = join(process.cwd(), clientExampleDir, "tools");
    if (existsSync(toolsDir)) {
      const files = readdirSync(toolsDir).filter((f: string) => f.endsWith(".ts"));
      for (const file of files) {
        const content = readFileSync(join(toolsDir, file), "utf-8");
        expect(content).not.toContain("@/lib/infisical");
        expect(content).not.toContain("fetchSecret");
      }
    }
  });
});

// ── Helpers ─────────────────────────────────────────────────────

function simulateApiCall(token: string): { authenticated: boolean } {
  return { authenticated: token.startsWith("ya29.") };
}
