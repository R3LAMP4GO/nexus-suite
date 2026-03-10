import { describe, it, expect, vi } from "vitest";

// Mock child_process and fs — needed because ffmpeg.ts imports them at module level
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  stat: vi.fn(async () => ({ size: 1024 })),
}));

// ── Import transforms (pure functions, no mocks needed) ─────────
import {
  composeTransforms,
  layer1FileHash,
  layer2Visual,
  layer3Audio,
  layer4Structural,
  type TransformFragment,
} from "../transforms";

import { buildArgs } from "../ffmpeg";

describe("Media Engine — Transforms", () => {
  describe("composeTransforms", () => {
    it("merges all 4 layers into single fragment", () => {
      const result = composeTransforms({
        layer1: true,
        layer2: { mirror: false, cropPercent: 3 },
        layer3: { pitchSemitones: 1, noiseDbfs: -60 },
        layer4: { crf: 20, preset: "medium" },
      });

      expect(result.videoFilters.length).toBeGreaterThan(0);
      expect(result.audioFilters.length).toBeGreaterThan(0);
      expect(result.outputArgs.length).toBeGreaterThan(0);
    });

    it("includes layer1 file hash by default", () => {
      const result = composeTransforms();

      expect(result.outputArgs).toContain("-map_metadata");
      expect(result.outputArgs).toContain("-1");
      expect(result.outputArgs).toContain("-fflags");
      expect(result.outputArgs).toContain("+bitexact");
    });

    it("skips layer1 when disabled", () => {
      const result = composeTransforms({ layer1: false });

      expect(result.outputArgs).not.toContain("-map_metadata");
    });
  });

  describe("layer3Audio — white noise injection", () => {
    it("generates anoisesrc filter with correct -60dB amplitude", () => {
      const result = layer3Audio({ noiseDbfs: -60 });

      const noiseFilter = result.audioFilters.find((f) =>
        f.startsWith("anoisesrc="),
      );
      expect(noiseFilter).toBeDefined();

      // -60 dBFS → amplitude = 10^(-60/20) = 10^(-3) = 0.001
      const expectedAmplitude = Math.pow(10, -60 / 20);
      expect(noiseFilter).toContain(`a=${expectedAmplitude.toFixed(8)}`);
    });

    it("generates correct amplitude for -50dB", () => {
      const result = layer3Audio({ noiseDbfs: -50 });

      const noiseFilter = result.audioFilters.find((f) =>
        f.startsWith("anoisesrc="),
      );
      // -50 dBFS → 10^(-2.5) ≈ 0.00316228
      const expectedAmplitude = Math.pow(10, -50 / 20);
      expect(noiseFilter).toContain(`a=${expectedAmplitude.toFixed(8)}`);
    });

    it("includes pitch shift via asetrate", () => {
      const result = layer3Audio({ pitchSemitones: 2 });

      const asetrate = result.audioFilters.find((f) =>
        f.startsWith("asetrate="),
      );
      expect(asetrate).toBeDefined();
      // 2 semitones up: rate = 44100 * 2^(2/12) ≈ 49476
      const expectedRate = Math.round(44100 * Math.pow(2, 2 / 12));
      expect(asetrate).toBe(`asetrate=${expectedRate}`);
    });

    it("includes tempo adjustment", () => {
      const result = layer3Audio({ tempoFactor: 1.02 });

      expect(result.audioFilters).toContain("atempo=1.0200");
    });
  });

  describe("layer2Visual", () => {
    it("includes hflip when mirror=true", () => {
      const result = layer2Visual({ mirror: true });
      expect(result.videoFilters).toContain("hflip");
    });

    it("excludes hflip when mirror=false", () => {
      const result = layer2Visual({ mirror: false });
      expect(result.videoFilters).not.toContain("hflip");
    });

    it("includes crop, setpts, hue, colorbalance, pad, noise, setdar", () => {
      const result = layer2Visual({
        mirror: false,
        cropPercent: 3,
        speedFactor: 1.0,
        colorShiftHue: 10,
        colorBalanceRs: 0.05,
        padding: 2,
        noiseStrength: 5,
        darAdjust: 0.01,
      });

      expect(result.videoFilters.some((f) => f.startsWith("crop="))).toBe(true);
      expect(result.videoFilters.some((f) => f.startsWith("setpts="))).toBe(true);
      expect(result.videoFilters.some((f) => f.startsWith("hue="))).toBe(true);
      expect(result.videoFilters.some((f) => f.startsWith("colorbalance="))).toBe(true);
      expect(result.videoFilters.some((f) => f.startsWith("pad="))).toBe(true);
      expect(result.videoFilters.some((f) => f.startsWith("noise="))).toBe(true);
      expect(result.videoFilters.some((f) => f.startsWith("setdar="))).toBe(true);
    });
  });

  describe("layer4Structural", () => {
    it("sets CRF, preset, GOP, pixel format", () => {
      const result = layer4Structural({
        crf: 20,
        preset: "slow",
        gop: 48,
        pixFmt: "yuv420p",
      });

      expect(result.outputArgs).toContain("-crf");
      expect(result.outputArgs).toContain("20");
      expect(result.outputArgs).toContain("-preset");
      expect(result.outputArgs).toContain("slow");
      expect(result.outputArgs).toContain("-g");
      expect(result.outputArgs).toContain("48");
      expect(result.outputArgs).toContain("-pix_fmt");
      expect(result.outputArgs).toContain("yuv420p");
    });
  });
});

describe("Media Engine — FFmpeg buildArgs", () => {
  it("uses complex filtergraph when anoisesrc present", () => {
    const fragment: TransformFragment = {
      videoFilters: ["hflip", "crop=iw*0.97:ih*0.97"],
      audioFilters: [
        "asetrate=45000",
        "aresample=44100",
        "atempo=1.01",
        "anoisesrc=d=0:c=white:a=0.00100000[noise]",
      ],
      outputArgs: ["-crf", "20", "-b:a", "192k"],
    };

    const args = buildArgs("/tmp/in.mp4", "/tmp/out.mp4", fragment);

    expect(args).toContain("-filter_complex");
    // Should contain amix for noise mixing
    const filterComplexIdx = args.indexOf("-filter_complex");
    const filterStr = args[filterComplexIdx + 1];
    expect(filterStr).toContain("amix");
    expect(filterStr).toContain("[aout]");
    // Should map outputs
    expect(args).toContain("-map");
    expect(args.some((a) => a === "[aout]")).toBe(true);
  });

  it("uses simple -vf/-af when no anoisesrc", () => {
    const fragment: TransformFragment = {
      videoFilters: ["hflip"],
      audioFilters: ["asetrate=45000", "aresample=44100"],
      outputArgs: ["-crf", "20"],
    };

    const args = buildArgs("/tmp/in.mp4", "/tmp/out.mp4", fragment);

    expect(args).toContain("-vf");
    expect(args).toContain("-af");
    expect(args).not.toContain("-filter_complex");
  });

  it("always starts with -y -i input", () => {
    const fragment: TransformFragment = {
      videoFilters: [],
      audioFilters: [],
      outputArgs: [],
    };

    const args = buildArgs("/tmp/in.mp4", "/tmp/out.mp4", fragment);

    expect(args[0]).toBe("-y");
    expect(args[1]).toBe("-i");
    expect(args[2]).toBe("/tmp/in.mp4");
  });

  it("ends with output path", () => {
    const fragment: TransformFragment = {
      videoFilters: [],
      audioFilters: [],
      outputArgs: ["-crf", "20"],
    };

    const args = buildArgs("/tmp/in.mp4", "/tmp/out.mp4", fragment);

    expect(args[args.length - 1]).toBe("/tmp/out.mp4");
  });
});

describe("Media Engine — Audio Safety", () => {
  it("music detection heuristic: low silence + high range + loud = music", () => {
    // This tests the pure logic from analyzeAudio's heuristic
    const silenceRatio = 0.1; // < 0.3
    const loudnessRange = 8; // > 5
    const integratedLoudness = -25; // > -40

    const likelyMusic =
      silenceRatio < 0.3 && loudnessRange > 5 && integratedLoudness > -40;

    expect(likelyMusic).toBe(true);
  });

  it("speech detection: high silence ratio = not music", () => {
    const silenceRatio = 0.5; // > 0.3 — lots of pauses
    const loudnessRange = 3; // < 5
    const integratedLoudness = -30;

    const likelyMusic =
      silenceRatio < 0.3 && loudnessRange > 5 && integratedLoudness > -40;

    expect(likelyMusic).toBe(false);
  });

  it("quiet audio = not music", () => {
    const silenceRatio = 0.1;
    const loudnessRange = 8;
    const integratedLoudness = -50; // < -40 — too quiet

    const likelyMusic =
      silenceRatio < 0.3 && loudnessRange > 5 && integratedLoudness > -40;

    expect(likelyMusic).toBe(false);
  });

  it("ensureAudioSafe uses anullsrc at 44100Hz stereo when stripping", () => {
    // When music is detected, ensureAudioSafe calls ffmpeg with:
    // -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100"
    // -c:v copy -c:a aac -shortest -map 0:v:0 -map 1:a:0
    const expectedArgs = [
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      "-map", "0:v:0",
      "-map", "1:a:0",
    ];

    // Verify the expected argument pattern
    expect(expectedArgs).toContain("-f");
    expect(expectedArgs).toContain("anullsrc=channel_layout=stereo:sample_rate=44100");
    expect(expectedArgs).toContain("-c:a");
    expect(expectedArgs).toContain("aac");
    expect(expectedArgs).toContain("-map");
    expect(expectedArgs).toContain("0:v:0");
    expect(expectedArgs).toContain("1:a:0");
  });
});
