import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Mock child_process ──────────────────────────────────────────
const mockExecFile = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// ── Mock fs/promises ────────────────────────────────────────────
const mockStat = vi.fn();
vi.mock("node:fs/promises", () => ({
  stat: (...args: unknown[]) => mockStat(...args),
}));

// ── Mock crypto ─────────────────────────────────────────────────
vi.mock("node:crypto", () => ({
  randomUUID: () => "aaaabbbb-cccc-dddd-eeee-ffffffffffff",
}));

let download: typeof import("../download.js")["download"];

beforeAll(async () => {
  const mod = await import("../download.js");
  download = mod.download;
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PROXY_DATACENTER_ENDPOINT;
});

function simulateExecSuccess(stdout: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, stdout, "");
    },
  );
}

describe("download", () => {
  it("constructs yt-dlp args with url and output template", async () => {
    simulateExecSuccess("/tmp/ytdl-aaaabbbb-title.mp4");
    mockStat.mockResolvedValue({ size: 1024 });

    await download({ url: "https://youtube.com/watch?v=abc" });

    const args = mockExecFile.mock.calls[0]![1];
    expect(args[0]).toBe("https://youtube.com/watch?v=abc");
    expect(args).toContain("-o");
    expect(args).toContain("--no-playlist");
    expect(args).toContain("--print");
    expect(args).toContain("after_move:filepath");
  });

  it("includes format flag when format specified", async () => {
    simulateExecSuccess("/tmp/ytdl-aaaabbbb-title.mp4");
    mockStat.mockResolvedValue({ size: 2048 });

    await download({ url: "https://example.com/v", format: "bestvideo[height<=1080]" });

    const args = mockExecFile.mock.calls[0]![1];
    const fIdx = args.indexOf("-f");
    expect(fIdx).toBeGreaterThan(-1);
    expect(args[fIdx + 1]).toBe("bestvideo[height<=1080]");
  });

  it("injects proxy from opts.proxy", async () => {
    simulateExecSuccess("/tmp/ytdl-aaaabbbb-title.mp4");
    mockStat.mockResolvedValue({ size: 512 });

    await download({ url: "https://example.com/v", proxy: "http://proxy:8080" });

    const args = mockExecFile.mock.calls[0]![1];
    const pIdx = args.indexOf("--proxy");
    expect(pIdx).toBeGreaterThan(-1);
    expect(args[pIdx + 1]).toBe("http://proxy:8080");
  });

  it("injects proxy from PROXY_DATACENTER_ENDPOINT env", async () => {
    process.env.PROXY_DATACENTER_ENDPOINT = "http://dc-proxy:3128";
    simulateExecSuccess("/tmp/ytdl-aaaabbbb-title.mp4");
    mockStat.mockResolvedValue({ size: 512 });

    await download({ url: "https://example.com/v" });

    const args = mockExecFile.mock.calls[0]![1];
    expect(args).toContain("--proxy");
    expect(args).toContain("http://dc-proxy:3128");
  });

  it("no proxy args when no proxy configured", async () => {
    simulateExecSuccess("/tmp/ytdl-aaaabbbb-title.mp4");
    mockStat.mockResolvedValue({ size: 512 });

    await download({ url: "https://example.com/v" });

    const args = mockExecFile.mock.calls[0]![1];
    expect(args).not.toContain("--proxy");
  });

  it("returns localPath, filename, and size", async () => {
    simulateExecSuccess("/tmp/ytdl-aaaabbbb-My Video Title.mp4");
    mockStat.mockResolvedValue({ size: 4096 });

    const result = await download({ url: "https://example.com/v" });

    expect(result.localPath).toBe("/tmp/ytdl-aaaabbbb-My Video Title.mp4");
    expect(result.filename).toBe("ytdl-aaaabbbb-My Video Title.mp4");
    expect(result.size).toBe(4096);
  });

  it("uses /tmp as temp directory in output template", async () => {
    simulateExecSuccess("/tmp/ytdl-aaaabbbb-title.mp4");
    mockStat.mockResolvedValue({ size: 100 });

    await download({ url: "https://example.com/v" });

    const args = mockExecFile.mock.calls[0]![1];
    const outputIdx = args.indexOf("-o");
    expect(args[outputIdx + 1]).toContain("/tmp/ytdl-");
  });

  it("throws on yt-dlp failure", async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error("exit code 1"), "", "ERROR: video not found");
      },
    );

    await expect(download({ url: "https://example.com/v" })).rejects.toThrow("failed");
  });
});
