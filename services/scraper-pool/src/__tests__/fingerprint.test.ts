import { describe, it, expect } from "vitest";
import { generateBrowserProfile } from "../fingerprint";

describe("generateBrowserProfile", () => {
  it("returns all required fields", () => {
    const profile = generateBrowserProfile();

    expect(profile).toHaveProperty("userAgent");
    expect(profile).toHaveProperty("screenWidth");
    expect(profile).toHaveProperty("screenHeight");
    expect(profile).toHaveProperty("hardwareConcurrency");
    expect(profile).toHaveProperty("platform");
    expect(profile).toHaveProperty("languages");
    expect(profile).toHaveProperty("canvasNoiseSeed");
    expect(profile).toHaveProperty("webglVendor");
    expect(profile).toHaveProperty("webglRenderer");
    expect(profile).toHaveProperty("timezone");
    expect(profile).toHaveProperty("locale");
  });

  it("generates valid Chrome user agent", () => {
    const profile = generateBrowserProfile();
    expect(profile.userAgent).toContain("Mozilla/5.0");
    expect(profile.userAgent).toContain("Chrome/");
    expect(profile.userAgent).toContain("Safari/537.36");
  });

  it("generates valid screen dimensions", () => {
    const profile = generateBrowserProfile();
    expect(profile.screenWidth).toBeGreaterThan(0);
    expect(profile.screenHeight).toBeGreaterThan(0);
  });

  it("generates unique canvasNoiseSeed (hex)", () => {
    const profile = generateBrowserProfile();
    expect(profile.canvasNoiseSeed).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces different profiles across generations", () => {
    const profiles = Array.from({ length: 20 }, () => generateBrowserProfile());
    const seeds = profiles.map((p) => p.canvasNoiseSeed);
    const uniqueSeeds = new Set(seeds);
    // With 20 random seeds, collision probability is negligible
    expect(uniqueSeeds.size).toBe(20);
  });

  it("Mac profiles use Apple WebGL vendor", () => {
    // Generate many profiles and check Mac ones
    const profiles = Array.from({ length: 100 }, () => generateBrowserProfile());
    const macProfiles = profiles.filter((p) => p.platform === "MacIntel");

    for (const p of macProfiles) {
      expect(p.webglVendor).toBe("Apple");
      expect(p.webglRenderer).toMatch(/^Apple M/);
    }
  });

  it("locale matches first language", () => {
    const profiles = Array.from({ length: 50 }, () => generateBrowserProfile());
    for (const p of profiles) {
      expect(p.locale).toBe(p.languages[0]);
    }
  });

  it("timezone is a valid IANA timezone", () => {
    const profile = generateBrowserProfile();
    expect(profile.timezone).toMatch(/^[A-Z][a-z]+\/[A-Za-z_]+$/);
  });

  it("hardwareConcurrency is a valid power of 2 or 12", () => {
    const profiles = Array.from({ length: 50 }, () => generateBrowserProfile());
    const validValues = [4, 8, 12, 16];
    for (const p of profiles) {
      expect(validValues).toContain(p.hardwareConcurrency);
    }
  });

  it("platform is one of the expected OS values", () => {
    const profiles = Array.from({ length: 50 }, () => generateBrowserProfile());
    const validPlatforms = ["Win32", "MacIntel", "Linux x86_64"];
    for (const p of profiles) {
      expect(validPlatforms).toContain(p.platform);
    }
  });
});
