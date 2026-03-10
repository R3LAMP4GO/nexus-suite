import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Mock Redis ──────────────────────────────────────────────────
const store = new Map<string, string>();

const redisMock = {
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
  exists: vi.fn(async (...keys: string[]) => {
    return keys.filter((k) => store.has(k)).length;
  }),
};

vi.mock("ioredis", () => ({
  Redis: class {
    get = redisMock.get;
    set = redisMock.set;
    del = redisMock.del;
    exists = redisMock.exists;
  },
}));

let recordAction: typeof import("../health-tracker.js")["recordAction"];
let getHealth: typeof import("../health-tracker.js")["getHealth"];
let isStale: typeof import("../health-tracker.js")["isStale"];
let flagStale: typeof import("../health-tracker.js")["flagStale"];
let isMarkedStale: typeof import("../health-tracker.js")["isMarkedStale"];
let clearStale: typeof import("../health-tracker.js")["clearStale"];
let recordVerification: typeof import("../health-tracker.js")["recordVerification"];

beforeAll(async () => {
  const mod = await import("../health-tracker.js");
  recordAction = mod.recordAction;
  getHealth = mod.getHealth;
  isStale = mod.isStale;
  flagStale = mod.flagStale;
  isMarkedStale = mod.isMarkedStale;
  clearStale = mod.clearStale;
  recordVerification = mod.recordVerification;
});

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe("recordAction", () => {
  it("creates new health entry on first action", async () => {
    await recordAction("acc_1", 1);

    expect(redisMock.set).toHaveBeenCalledWith(
      "session:health:acc_1",
      expect.any(String),
      "EX",
      30 * 86400,
    );

    const health = await getHealth("acc_1");
    expect(health).not.toBeNull();
    expect(health!.actionCount).toBe(1);
    expect(health!.phase).toBe(1);
  });

  it("increments actionCount on subsequent actions", async () => {
    await recordAction("acc_1", 1);
    await recordAction("acc_1", 2);

    const health = await getHealth("acc_1");
    expect(health!.actionCount).toBe(2);
    expect(health!.phase).toBe(2);
  });

  it("updates lastActionAt timestamp", async () => {
    await recordAction("acc_1", 1);

    const health = await getHealth("acc_1");
    const ts = new Date(health!.lastActionAt).getTime();
    expect(ts).toBeGreaterThan(Date.now() - 5000);
  });
});

describe("isStale", () => {
  it("returns true when no health record exists", async () => {
    expect(await isStale("nonexistent")).toBe(true);
  });

  it("returns false for recently active account", async () => {
    await recordAction("acc_1", 1);
    expect(await isStale("acc_1")).toBe(false);
  });

  it("returns true when last action older than 7 days", async () => {
    const oldEntry = {
      lastActionAt: new Date(Date.now() - 8 * 86400 * 1000).toISOString(),
      actionCount: 5,
      phase: 2,
      verificationCount: 0,
      lastVerifiedAt: null,
      verificationFailures: 0,
    };
    store.set("session:health:acc_old", JSON.stringify(oldEntry));

    expect(await isStale("acc_old")).toBe(true);
  });
});

describe("flagStale / isMarkedStale / clearStale", () => {
  it("flags account as stale", async () => {
    await flagStale("acc_1");
    expect(await isMarkedStale("acc_1")).toBe(true);
  });

  it("isMarkedStale returns false when not flagged", async () => {
    expect(await isMarkedStale("acc_unflagged")).toBe(false);
  });

  it("clearStale removes stale flag", async () => {
    await flagStale("acc_1");
    await clearStale("acc_1");
    expect(await isMarkedStale("acc_1")).toBe(false);
  });
});

describe("recordVerification", () => {
  it("increments verificationCount", async () => {
    await recordAction("acc_1", 1);
    await recordVerification("acc_1", true);

    const health = await getHealth("acc_1");
    expect(health!.verificationCount).toBe(1);
    expect(health!.lastVerifiedAt).not.toBeNull();
  });

  it("increments verificationFailures on failure", async () => {
    await recordAction("acc_1", 1);
    await recordVerification("acc_1", false);

    const health = await getHealth("acc_1");
    expect(health!.verificationFailures).toBe(1);
  });

  it("does not increment failures on success", async () => {
    await recordAction("acc_1", 1);
    await recordVerification("acc_1", true);

    const health = await getHealth("acc_1");
    expect(health!.verificationFailures).toBe(0);
  });
});
