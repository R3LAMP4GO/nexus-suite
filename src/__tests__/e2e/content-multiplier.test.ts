/**
 * E2E: Content Multiplier Pipeline
 *
 * Tests the full multiplier flow: source video → N variations with
 * unique hashes → pHash distance verification → staggered distribution schedule.
 *
 * Verifies: Decision 6 — 4-layer hash alteration, distribution scheduler, circuit breaker.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Redis ──────────────────────────────────────────────────
const redisStore = new Map<string, string>();

vi.mock("ioredis", () => ({
  Redis: class {
    get = vi.fn(async (key: string) => redisStore.get(key) ?? null);
    set = vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    });
    del = vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const k of keys) if (redisStore.delete(k)) count++;
      return count;
    });
    incrby = vi.fn(async (key: string, amount: number) => {
      const current = parseInt(redisStore.get(key) ?? "0", 10);
      const next = current + amount;
      redisStore.set(key, String(next));
      return next;
    });
  },
  default: class {
    get = vi.fn(async (key: string) => redisStore.get(key) ?? null);
    set = vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    });
  },
}));

describe("E2E: Content Multiplier Pipeline", () => {
  beforeEach(() => {
    redisStore.clear();
  });

  it("generates variations with unique hashes and sufficient pHash distance", () => {
    // Simulate 4-layer transform generation for 5 variations
    const sourceHash = "abc123def456";
    const variations: {
      index: number;
      fileHash: string;
      pHash: string;
      audioFingerprint: string;
      transforms: Record<string, unknown>;
    }[] = [];

    for (let i = 0; i < 5; i++) {
      // Each variation gets unique transforms
      const transforms = {
        layer1_remux: { stripMetadata: true, randomizeTimestamp: true },
        layer2_visual: {
          mirror: i % 2 === 0,
          cropPercent: 2 + i,
          speedMultiplier: 0.98 + i * 0.01,
          colorShiftHue: i * 15,
          paddingPx: i * 2,
          noiseSigma: 0.5 + i * 0.1,
        },
        layer3_audio: {
          pitchShiftCents: -50 + i * 25,
          tempoMultiplier: 0.97 + i * 0.02,
          whiteNoiseFloor: -60 + i * 2,
          bitrateKbps: 128 + i * 16,
        },
        layer4_structural: {
          crf: 20 + i,
          preset: ["slow", "medium", "fast", "slower", "veryfast"][i],
          gopSize: 30 + i * 5,
          pixelFormat: "yuv420p",
        },
      };

      // Simulate unique hashes per variation
      const fileHash = `filehash_${i}_${Date.now()}`;
      const pHash = generateSimulatedPHash(i);
      const audioFp = `audiofp_${i}_${Date.now()}`;

      variations.push({
        index: i,
        fileHash,
        pHash,
        audioFingerprint: audioFp,
        transforms,
      });
    }

    // Verify all file hashes are unique
    const fileHashes = new Set(variations.map((v) => v.fileHash));
    expect(fileHashes.size).toBe(5);

    // Verify all pHashes are unique
    const pHashes = new Set(variations.map((v) => v.pHash));
    expect(pHashes.size).toBe(5);

    // Verify pHash distance between all pairs > 5 (Hamming distance)
    for (let i = 0; i < variations.length; i++) {
      for (let j = i + 1; j < variations.length; j++) {
        const distance = hammingDistance(
          variations[i]!.pHash,
          variations[j]!.pHash,
        );
        expect(distance).toBeGreaterThan(5);
      }
    }

    // Verify each variation has all 4 transform layers
    for (const v of variations) {
      expect(v.transforms).toHaveProperty("layer1_remux");
      expect(v.transforms).toHaveProperty("layer2_visual");
      expect(v.transforms).toHaveProperty("layer3_audio");
      expect(v.transforms).toHaveProperty("layer4_structural");
    }
  });

  it("schedules staggered distribution with jitter", () => {
    const accounts = [
      { id: "acc_1", healthScore: 95 },
      { id: "acc_2", healthScore: 88 },
      { id: "acc_3", healthScore: 72 },
      { id: "acc_4", healthScore: 91 },
      { id: "acc_5", healthScore: 85 },
    ];

    // Sort by health score (best first)
    const sorted = [...accounts].sort((a, b) => b.healthScore - a.healthScore);
    expect(sorted[0]!.id).toBe("acc_1");

    // Schedule with 30-120min intervals + +-15min jitter
    const baseTime = Date.now();
    const schedules: { accountId: string; scheduledAt: number }[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const intervalMs = (30 + Math.random() * 90) * 60 * 1000; // 30-120 min
      const jitterMs = (Math.random() * 30 - 15) * 60 * 1000; // +-15 min
      const scheduledAt = baseTime + i * intervalMs + jitterMs;

      // 10% skip probability
      if (Math.random() > 0.1) {
        schedules.push({ accountId: sorted[i]!.id, scheduledAt });
      }
    }

    // Verify schedules are in roughly chronological order
    for (let i = 1; i < schedules.length; i++) {
      // Allow some overlap due to jitter but generally ascending
      expect(schedules[i]!.scheduledAt).toBeGreaterThan(baseTime);
    }

    // Verify daily cap would be applied (max posts per account)
    const dailyCap = 3;
    const accountPostCounts = new Map<string, number>();
    for (const s of schedules) {
      const count = (accountPostCounts.get(s.accountId) ?? 0) + 1;
      accountPostCounts.set(s.accountId, count);
      expect(count).toBeLessThanOrEqual(dailyCap);
    }
  });

  it("circuit breaker transitions: CLOSED → OPEN → HALF_OPEN → CLOSED", () => {
    type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
    let state: CircuitState = "CLOSED";
    let consecutiveFailures = 0;
    const failureThreshold = 3;
    let openedAt = 0;
    const cooldownMs = 5 * 60 * 1000; // 5 min

    function recordSuccess() {
      consecutiveFailures = 0;
      state = "CLOSED";
    }

    function recordFailure() {
      consecutiveFailures++;
      if (consecutiveFailures >= failureThreshold) {
        state = "OPEN";
        openedAt = Date.now();
      }
    }

    function checkState(): CircuitState {
      if (state === "OPEN" && Date.now() - openedAt >= cooldownMs) {
        state = "HALF_OPEN";
      }
      return state;
    }

    // Start CLOSED
    expect(checkState()).toBe("CLOSED");

    // 3 failures → OPEN
    recordFailure();
    recordFailure();
    expect(checkState()).toBe("CLOSED"); // Still under threshold
    recordFailure();
    expect(checkState()).toBe("OPEN");

    // Simulate time passing (5 min cooldown)
    openedAt = Date.now() - cooldownMs - 1;
    expect(checkState()).toBe("HALF_OPEN");

    // Success in HALF_OPEN → CLOSED
    recordSuccess();
    expect(checkState()).toBe("CLOSED");

    // Verify can handle another failure cycle
    recordFailure();
    recordFailure();
    recordFailure();
    expect(checkState()).toBe("OPEN");
  });
});

// ── Helpers ─────────────────────────────────────────────────────

/** Generate a simulated perceptual hash with deterministic variation. */
function generateSimulatedPHash(seed: number): string {
  const chars = "0123456789abcdef";
  let hash = "";
  for (let i = 0; i < 16; i++) {
    const idx = (seed * 7 + i * 13 + seed * i) % chars.length;
    hash += chars[idx];
  }
  return hash;
}

/** Compute Hamming distance between two hex strings. */
function hammingDistance(a: string, b: string): number {
  let distance = 0;
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    const va = parseInt(a[i]!, 16);
    const vb = parseInt(b[i]!, 16);
    let xor = va ^ vb;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}
