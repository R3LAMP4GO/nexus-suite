import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies BEFORE importing the module
vi.mock("@/lib/env", () => ({}));
vi.mock("@/server/auth/config", () => ({
  auth: vi.fn(async () => null),
}));

const dbMock = vi.hoisted(() => ({}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

const redisMock = vi.hoisted(() => ({
  incr: vi.fn(async () => 1),
  expire: vi.fn(async () => 1),
  incrby: vi.fn(async () => 1),
}));

vi.mock("ioredis", () => ({
  Redis: class {
    incr = redisMock.incr;
    expire = redisMock.expire;
    incrby = redisMock.incrby;
  },
}));

const checkRateLimitMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  MUTATION_LIMIT: { limit: 60, windowSecs: 60 },
}));

const checkUsageLimitMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/usage-tracking", () => ({
  checkUsageLimit: checkUsageLimitMock,
}));

// We test the middleware logic through the exported procedures
// by verifying the module exports the correct procedure types
import {
  publicProcedure,
  authedProcedure,
  subscribedProcedure,
  onboardedProcedure,
  adminProcedure,
  tierGatedProcedure,
  createTRPCRouter,
} from "../trpc";

describe("tRPC middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 });
    checkUsageLimitMock.mockResolvedValue({ allowed: true, current: 0, limit: 50 });
  });

  it("exports publicProcedure", () => {
    expect(publicProcedure).toBeDefined();
  });

  it("exports authedProcedure", () => {
    expect(authedProcedure).toBeDefined();
  });

  it("exports subscribedProcedure", () => {
    expect(subscribedProcedure).toBeDefined();
  });

  it("exports onboardedProcedure", () => {
    expect(onboardedProcedure).toBeDefined();
  });

  it("exports adminProcedure", () => {
    expect(adminProcedure).toBeDefined();
  });

  it("exports createTRPCRouter", () => {
    expect(createTRPCRouter).toBeDefined();
    expect(typeof createTRPCRouter).toBe("function");
  });

  it("tierGatedProcedure returns a procedure for boolean gates", () => {
    const proc = tierGatedProcedure("multiplierEnabled");
    expect(proc).toBeDefined();
  });

  it("tierGatedProcedure returns a procedure for numeric gates", () => {
    const proc = tierGatedProcedure("maxAccounts");
    expect(proc).toBeDefined();
  });

  it("tierGatedProcedure handles all valid feature gates", () => {
    expect(() => tierGatedProcedure("mlFeaturesEnabled")).not.toThrow();
    expect(() => tierGatedProcedure("multiplierEnabled")).not.toThrow();
    expect(() => tierGatedProcedure("maxAccounts")).not.toThrow();
    expect(() => tierGatedProcedure("maxWorkflowRuns")).not.toThrow();
    expect(() => tierGatedProcedure("maxVideosPerMonth")).not.toThrow();
  });
});
