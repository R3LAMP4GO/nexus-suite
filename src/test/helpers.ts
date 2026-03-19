import { vi } from "vitest";
import { prismaMock } from "./factories";

// ── Mock DB (Prisma) ──────────────────────────────────────────
// Re-export prismaMock for convenience — same deep mock used across tests.
export function mockDb() {
  return prismaMock;
}

// ── Mock Redis ────────────────────────────────────────────────
// In-memory Redis mock matching ioredis interface subset.
export function mockRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ..._args: unknown[]) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
      }
      return count;
    }),
    exists: vi.fn(async (...keys: string[]) => {
      return keys.filter((k) => store.has(k)).length;
    }),
    ttl: vi.fn(async (key: string) => ttls.get(key) ?? -1),
    hget: vi.fn(),
    hset: vi.fn(),
    hmget: vi.fn(),
    hmset: vi.fn(),
    expire: vi.fn(),
    pexpire: vi.fn(),
    incrby: vi.fn(),
    publish: vi.fn(),
    eval: vi.fn(),
    // Internals for test assertions
    _store: store,
    _ttls: ttls,
  };
}

// ── Mock tRPC Context ─────────────────────────────────────────
export function createMockContext(
  overrides: Record<string, unknown> = {},
) {
  return {
    db: prismaMock,
    organizationId: "org_test",
    session: {
      user: { id: "user_test", name: "Test User", email: "test@test.com" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
    ...overrides,
  };
}

// ── Mock pg-boss ─────────────────────────────────────────────────
export function mockPgBoss() {
  return {
    send: vi.fn(async () => `job_${Date.now()}`),
    sendAfter: vi.fn(async () => `job_${Date.now()}`),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    fetch: vi.fn(async () => null),
    complete: vi.fn(),
    fail: vi.fn(),
    cancel: vi.fn(),
    getQueueSize: vi.fn(async () => 0),
    createQueue: vi.fn(),
    deleteQueue: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

// ── Mock S3 Client ───────────────────────────────────────────────
export function mockS3Client() {
  return {
    send: vi.fn(async (command: unknown) => {
      const name = (command as { constructor: { name: string } }).constructor.name;
      switch (name) {
        case "PutObjectCommand":
          return {};
        case "GetObjectCommand":
          return {
            Body: {
              async *[Symbol.asyncIterator]() {
                yield Buffer.from("test-content");
              },
            },
          };
        case "DeleteObjectCommand":
          return {};
        case "HeadObjectCommand":
          return { ContentLength: 1024, ContentType: "video/mp4" };
        case "ListObjectsV2Command":
          return { Contents: [], IsTruncated: false };
        case "CopyObjectCommand":
          return {};
        default:
          return {};
      }
    }),
  };
}

// ── Mock Infisical ───────────────────────────────────────────────
export function mockInfisical() {
  return {
    fetchSecret: vi.fn(async () => "mock-secret-value"),
    fetchSecrets: vi.fn(async () => ({})),
  };
}
