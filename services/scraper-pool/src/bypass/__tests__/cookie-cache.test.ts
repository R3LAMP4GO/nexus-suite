import { describe, it, expect, vi, beforeEach } from "vitest";
import { CookieCache } from "../cookie-cache";

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const k of keys) { if (store.delete(k)) count++; }
      return count;
    }),
    _store: store,
  };
}

describe("CookieCache", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let cache: CookieCache;

  beforeEach(() => {
    redis = createMockRedis();
    cache = new CookieCache(redis as any);
  });

  it("stores cookies with correct Redis key format", async () => {
    await cache.set("example.com", {
      cookies: [{ name: "cf_clearance", value: "abc", domain: ".example.com", path: "/" }],
      userAgent: "Chrome/120",
    });

    expect(redis.set).toHaveBeenCalledWith(
      "scraper:cf:example.com",
      expect.any(String),
      "EX",
      1800, // default TTL 30 min
    );
  });

  it("retrieves stored cookies", async () => {
    const data = {
      cookies: [{ name: "cf_clearance", value: "xyz", domain: ".test.com", path: "/" }],
      userAgent: "Chrome/121",
    };
    await cache.set("test.com", data);

    const result = await cache.get("test.com");

    expect(result).toEqual(data);
  });

  it("returns null for missing domain", async () => {
    const result = await cache.get("unknown.com");
    expect(result).toBeNull();
  });

  it("invalidates cached cookies", async () => {
    await cache.set("example.com", {
      cookies: [{ name: "cf", value: "val", domain: ".example.com", path: "/" }],
      userAgent: "",
    });

    await cache.invalidate("example.com");

    expect(redis.del).toHaveBeenCalledWith("scraper:cf:example.com");
  });

  it("isolates domains from each other", async () => {
    await cache.set("a.com", {
      cookies: [{ name: "c", value: "a", domain: ".a.com", path: "/" }],
      userAgent: "",
    });
    await cache.set("b.com", {
      cookies: [{ name: "c", value: "b", domain: ".b.com", path: "/" }],
      userAgent: "",
    });

    const a = await cache.get("a.com");
    const b = await cache.get("b.com");

    expect(a!.cookies[0]!.value).toBe("a");
    expect(b!.cookies[0]!.value).toBe("b");
  });

  it("handles corrupt JSON gracefully", async () => {
    redis._store.set("scraper:cf:corrupt.com", "not-json{{{");

    const result = await cache.get("corrupt.com");
    expect(result).toBeNull();
  });

  it("uses custom TTL when provided", async () => {
    const customCache = new CookieCache(redis as any, 600);

    await customCache.set("custom.com", {
      cookies: [],
      userAgent: "",
    });

    expect(redis.set).toHaveBeenCalledWith(
      "scraper:cf:custom.com",
      expect.any(String),
      "EX",
      600,
    );
  });
});
