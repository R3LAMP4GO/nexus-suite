import { describe, it, expect } from "vitest";
import { validateNoCredentials, stripPII, enforceToolScope } from "../safety";

describe("validateNoCredentials", () => {
  it("allows clean text", () => {
    expect(() => validateNoCredentials("Hello world, this is safe text")).not.toThrow();
  });

  it("detects Stripe live keys", () => {
    // Build key dynamically to avoid GitHub push protection flagging test fixtures
    const stripeKey = ["sk", "live", "abc123def456ghi789jkl012"].join("_");
    expect(() => validateNoCredentials(`key: ${stripeKey}`)).toThrow("credential leak");
  });

  it("detects Stripe test keys", () => {
    const stripeKey = ["pk", "test", "abc123def456ghi789jkl012"].join("_");
    expect(() => validateNoCredentials(stripeKey)).toThrow("credential leak");
  });

  it("detects GitHub PATs", () => {
    expect(() => validateNoCredentials("token: ghp_abcdefghijklmnopqrstuvwxyz1234567890")).toThrow("credential leak");
  });

  it("detects JWTs", () => {
    expect(() =>
      validateNoCredentials("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"),
    ).toThrow("credential leak");
  });

  it("detects AWS access keys", () => {
    expect(() => validateNoCredentials("AKIAIOSFODNN7EXAMPLE")).toThrow("credential leak");
  });

  it("detects PEM private keys", () => {
    expect(() => validateNoCredentials("-----BEGIN RSA PRIVATE KEY-----")).toThrow("credential leak");
  });

  it("detects Slack tokens", () => {
    expect(() => validateNoCredentials("xoxb-1234567890-abcdefghij")).toThrow("credential leak");
  });

  it("detects generic secret assignments", () => {
    expect(() => validateNoCredentials('password = "supersecretpassword123"')).toThrow("credential leak");
  });
});

describe("stripPII", () => {
  it("replaces email addresses with [EMAIL]", () => {
    expect(stripPII("Contact john@example.com for info")).toBe("Contact [EMAIL] for info");
  });

  it("replaces phone numbers with [PHONE]", () => {
    expect(stripPII("Call 555-123-4567")).toBe("Call [PHONE]");
  });

  it("replaces SSNs with [SSN]", () => {
    expect(stripPII("SSN: 123-45-6789")).toBe("SSN: [SSN]");
  });

  it("replaces credit card numbers with [CARD]", () => {
    expect(stripPII("Card: 4111 1111 1111 1111")).toBe("Card: [CARD]");
  });

  it("handles multiple PII types in one string", () => {
    const input = "Email: user@test.com, Phone: 555-123-4567, SSN: 123-45-6789";
    const result = stripPII(input);
    expect(result).toContain("[EMAIL]");
    expect(result).toContain("[PHONE]");
    expect(result).toContain("[SSN]");
    expect(result).not.toContain("user@test.com");
  });

  it("returns unchanged text when no PII found", () => {
    expect(stripPII("This is safe text")).toBe("This is safe text");
  });
});

describe("enforceToolScope", () => {
  it("allows permitted tool for scoped agent", () => {
    expect(() => enforceToolScope("hook-writer", "searchViralPatterns")).not.toThrow();
  });

  it("blocks unpermitted tool for scoped agent", () => {
    expect(() => enforceToolScope("hook-writer", "deleteDatabase")).toThrow("not permitted");
  });

  it("allows any tool for unscoped agent", () => {
    expect(() => enforceToolScope("unknown-agent", "anyTool")).not.toThrow();
  });

  it("includes allowed tools in error message", () => {
    expect(() => enforceToolScope("caption-writer", "deleteAll")).toThrow("getCharLimits");
  });

  it("allows all registered tools for seo-agent", () => {
    expect(() => enforceToolScope("seo-agent", "tavilySearch")).not.toThrow();
    expect(() => enforceToolScope("seo-agent", "youtubeSearch")).not.toThrow();
    expect(() => enforceToolScope("seo-agent", "getKeywordMetrics")).not.toThrow();
  });

  it("blocks unregistered tools for seo-agent", () => {
    expect(() => enforceToolScope("seo-agent", "searchViralPatterns")).toThrow("not permitted");
  });
});
