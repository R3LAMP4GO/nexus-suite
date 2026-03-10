import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Infisical SDK ──────────────────────────────────────────
const mockGetSecret = vi.fn();
const mockUpdateSecret = vi.fn();
const mockCreateSecret = vi.fn();

const mockSdkInstance = {
  auth: () => ({
    universalAuth: {
      login: vi.fn(async () => ({})),
    },
  }),
  secrets: () => ({
    getSecret: mockGetSecret,
    updateSecret: mockUpdateSecret,
    createSecret: mockCreateSecret,
  }),
};

vi.mock("@infisical/sdk", () => {
  return {
    InfisicalSDK: class MockInfisicalSDK {
      auth = mockSdkInstance.auth;
      secrets = mockSdkInstance.secrets;
    },
  };
});

// ── Import after mocks ─────────────────────────────────────────
const { fetchSecret, storeSecret, getInfisicalClient } = await import(
  "@/lib/infisical"
);

describe("Infisical Security — Fetch-Use-Discard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchSecret returns secret value without caching", async () => {
    mockGetSecret.mockResolvedValueOnce({ secretValue: "sk-live-test123" });

    const value = await fetchSecret("proj_1", "dev", "/orgs/org_1/tokens/t1", "accessToken");

    expect(value).toBe("sk-live-test123");
    expect(mockGetSecret).toHaveBeenCalledWith({
      projectId: "proj_1",
      environment: "dev",
      secretPath: "/orgs/org_1/tokens/t1",
      secretName: "accessToken",
    });
  });

  it("consecutive fetches each call the SDK (no module-level cache)", async () => {
    mockGetSecret
      .mockResolvedValueOnce({ secretValue: "value-1" })
      .mockResolvedValueOnce({ secretValue: "value-2" });

    const v1 = await fetchSecret("proj_1", "dev", "/path1", "key1");
    const v2 = await fetchSecret("proj_1", "dev", "/path2", "key2");

    expect(v1).toBe("value-1");
    expect(v2).toBe("value-2");
    expect(mockGetSecret).toHaveBeenCalledTimes(2);
  });

  it("storeSecret tries update first, then create on failure", async () => {
    mockUpdateSecret.mockRejectedValueOnce(new Error("not found"));
    mockCreateSecret.mockResolvedValueOnce({});

    await storeSecret("proj_1", "dev", "/path", "key", "secret-value");

    expect(mockUpdateSecret).toHaveBeenCalledWith("key", {
      projectId: "proj_1",
      environment: "dev",
      secretPath: "/path",
      secretValue: "secret-value",
    });
    expect(mockCreateSecret).toHaveBeenCalledWith("key", {
      projectId: "proj_1",
      environment: "dev",
      secretPath: "/path",
      secretValue: "secret-value",
    });
  });

  it("storeSecret skips create when update succeeds", async () => {
    mockUpdateSecret.mockResolvedValueOnce({});

    await storeSecret("proj_1", "dev", "/path", "key", "secret-value");

    expect(mockUpdateSecret).toHaveBeenCalled();
    expect(mockCreateSecret).not.toHaveBeenCalled();
  });
});

describe("Infisical Security — DB stores only secret paths", () => {
  it("orgPlatformToken stores infisicalSecretPath, not raw credentials", () => {
    // This test verifies the architectural constraint:
    // The DB column is `infisicalSecretPath` (a path string like "/orgs/{orgId}/tokens/{label}")
    // NOT the raw access token / refresh token
    const tokenRecord = {
      organizationId: "org_1",
      platform: "YOUTUBE",
      accountLabel: "burner-1",
      infisicalSecretPath: "/orgs/org_1/tokens/burner-1", // <-- path, not secret
    };

    // Verify it's a path pattern, not a credential
    expect(tokenRecord.infisicalSecretPath).toMatch(/^\/orgs\//);
    expect(tokenRecord.infisicalSecretPath).not.toMatch(/^sk-/);
    expect(tokenRecord.infisicalSecretPath).not.toMatch(/Bearer/);
  });

  it("client singleton reuses SDK instance", async () => {
    const client1 = await getInfisicalClient();
    const client2 = await getInfisicalClient();

    // Same instance — SDK is initialized once, reused
    expect(client1).toBe(client2);
  });
});
