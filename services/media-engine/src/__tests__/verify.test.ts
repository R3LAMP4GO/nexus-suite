import { describe, it, expect } from "vitest";
import { hammingDistance, detectCollisions, getCollisionIndices } from "../verify";
import type { VariationFingerprint } from "../verify";

describe("hammingDistance", () => {
  it("returns 0 for identical hex strings", () => {
    expect(hammingDistance("abcd1234", "abcd1234")).toBe(0);
  });

  it("counts differing bits correctly", () => {
    // "0" = 0000, "1" = 0001 → 1 bit diff
    expect(hammingDistance("0", "1")).toBe(1);
  });

  it("handles full 16-char hex strings", () => {
    // All zeros vs all ones: each hex digit differs by 4 bits
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });

  it("uses min length when strings differ in length", () => {
    expect(hammingDistance("ab", "abcd")).toBe(0); // only compares first 2 chars
  });

  it("specific known values", () => {
    // "a" = 1010, "5" = 0101 → 4 bits differ
    expect(hammingDistance("a", "5")).toBe(4);
  });

  it("handles single char differences", () => {
    // "8" = 1000, "0" = 0000 → 1 bit
    expect(hammingDistance("8", "0")).toBe(1);
  });
});

describe("detectCollisions", () => {
  it("returns empty for unique fingerprints", () => {
    const fps: VariationFingerprint[] = [
      { index: 0, videoPath: "/a.mp4", pHash: "aaaaaaaaaaaaaaaa", audioFingerprint: "1111111111111111" },
      { index: 1, videoPath: "/b.mp4", pHash: "0000000000000000", audioFingerprint: "eeeeeeeeeeeeeeee" },
    ];
    expect(detectCollisions(fps)).toEqual([]);
  });

  it("detects collision when pHash distance <= 5", () => {
    const fps: VariationFingerprint[] = [
      { index: 0, videoPath: "/a.mp4", pHash: "0000000000000000", audioFingerprint: "aaaaaaaaaaaaaaaa" },
      { index: 1, videoPath: "/b.mp4", pHash: "0000000000000001", audioFingerprint: "0000000000000000" },
    ];
    const collisions = detectCollisions(fps);
    expect(collisions.length).toBe(1);
    expect(collisions[0]!.pHashDistance).toBeLessThanOrEqual(5);
  });

  it("detects collision when audio distance <= 5", () => {
    const fps: VariationFingerprint[] = [
      { index: 0, videoPath: "/a.mp4", pHash: "aaaaaaaaaaaaaaaa", audioFingerprint: "0000000000000000" },
      { index: 1, videoPath: "/b.mp4", pHash: "0000000000000000", audioFingerprint: "0000000000000001" },
    ];
    const collisions = detectCollisions(fps);
    expect(collisions.length).toBe(1);
    expect(collisions[0]!.audioDistance).toBeLessThanOrEqual(5);
  });

  it("no collision when both distances > 5", () => {
    const fps: VariationFingerprint[] = [
      { index: 0, videoPath: "/a.mp4", pHash: "0000000000000000", audioFingerprint: "0000000000000000" },
      { index: 1, videoPath: "/b.mp4", pHash: "ffffffffffffffff", audioFingerprint: "ffffffffffffffff" },
    ];
    expect(detectCollisions(fps)).toEqual([]);
  });

  it("checks all pairs in multi-variation set", () => {
    const fps: VariationFingerprint[] = [
      { index: 0, videoPath: "/a.mp4", pHash: "0000000000000000", audioFingerprint: "aaaaaaaaaaaaaaaa" },
      { index: 1, videoPath: "/b.mp4", pHash: "0000000000000000", audioFingerprint: "bbbbbbbbbbbbbbbb" },
      { index: 2, videoPath: "/c.mp4", pHash: "0000000000000000", audioFingerprint: "cccccccccccccccc" },
    ];
    const collisions = detectCollisions(fps);
    // All pairs collide on pHash (distance 0)
    expect(collisions.length).toBe(3); // (0,1), (0,2), (1,2)
  });
});

describe("getCollisionIndices", () => {
  it("returns higher index from each collision pair", () => {
    const collisions = [
      { indexA: 0, indexB: 2, pHashDistance: 0, audioDistance: 10 },
      { indexA: 1, indexB: 3, pHashDistance: 2, audioDistance: 10 },
    ];
    const indices = getCollisionIndices(collisions);
    expect(indices.sort()).toEqual([2, 3]);
  });

  it("deduplicates indices", () => {
    const collisions = [
      { indexA: 0, indexB: 2, pHashDistance: 0, audioDistance: 10 },
      { indexA: 1, indexB: 2, pHashDistance: 3, audioDistance: 10 },
    ];
    const indices = getCollisionIndices(collisions);
    expect(indices).toEqual([2]);
  });

  it("returns empty for no collisions", () => {
    expect(getCollisionIndices([])).toEqual([]);
  });
});
