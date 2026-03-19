import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("validateEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Set minimum required env vars
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    process.env.REDIS_URL = "redis://localhost:6379/0";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("passes with valid required vars", async () => {
    const { validateEnv } = await import("./env");
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const { validateEnv } = await import("./env");
    expect(() => validateEnv()).toThrow("DATABASE_URL");
  });

  it("throws when AUTH_SECRET is too short in production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.AUTH_SECRET = "short";
    // The module auto-validates on import when NODE_ENV !== "test",
    // so the import itself will throw.
    await expect(import("./env")).rejects.toThrow("AUTH_SECRET");
  });

  it("uses fallback for AUTH_SECRET in non-production", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    const { validateEnv } = await import("./env");
    expect(() => validateEnv()).not.toThrow();
  });

  it("accepts NEXTAUTH_SECRET as fallback for AUTH_SECRET", async () => {
    delete process.env.AUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "this-is-a-valid-secret-key";
    const { validateEnv } = await import("./env");
    expect(() => validateEnv()).not.toThrow();
  });
});
