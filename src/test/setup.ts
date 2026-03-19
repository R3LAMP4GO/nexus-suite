import { beforeEach, vi } from "vitest";
import { mockReset } from "vitest-mock-extended";
import { prismaMock } from "./factories";

// Ensure test environment
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379/0";
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
process.env.RESEND_API_KEY = "re_test_fake_key";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_BUCKET_NAME = "test-bucket";
process.env.R2_ACCOUNT_ID = "test-account";
process.env.INFISICAL_PROJECT_ID = "test-project";
process.env.INFISICAL_ENV = "test";

// Reset all mocks before each test
beforeEach(() => {
  mockReset(prismaMock);
  vi.clearAllMocks();
});
