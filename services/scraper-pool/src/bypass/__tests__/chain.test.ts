import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Mock dependencies ───────────────────────────────────────────
const mockPlainHttpFetch = vi.fn();
const mockChallengeDetectedError = class extends Error {
  type: string;
  constructor(type: string) {
    super(`challenge: ${type}`);
    this.type = type;
  }
};

vi.mock("../plain-http.js", () => ({
  plainHttpFetch: (...args: unknown[]) => mockPlainHttpFetch(...args),
  ChallengeDetectedError: mockChallengeDetectedError,
  detectChallenge: vi.fn(),
}));

const mockSolveTurnstile = vi.fn();
vi.mock("../turnstile.js", () => ({
  solveTurnstile: (...args: unknown[]) => mockSolveTurnstile(...args),
}));

const mockSolveRecaptcha = vi.fn();
vi.mock("../recaptcha.js", () => ({
  solveRecaptcha: (...args: unknown[]) => mockSolveRecaptcha(...args),
}));

const mockFetchWithCamoufox = vi.fn();
vi.mock("../camoufox.js", () => ({
  fetchWithCamoufox: (...args: unknown[]) => mockFetchWithCamoufox(...args),
}));

const mockFetchWithScrapling = vi.fn();
vi.mock("../scrapling-client.js", () => ({
  fetchWithScrapling: (...args: unknown[]) => mockFetchWithScrapling(...args),
}));

// ── Mock cookie cache (via Redis) ───────────────────────────────
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

// ── Mock BrowserContext ─────────────────────────────────────────
const mockContext = {
  newPage: vi.fn(),
  cookies: vi.fn(),
};

let runBypassChain: typeof import("../chain.js")["runBypassChain"];

beforeAll(async () => {
  const mod = await import("../chain.js");
  runBypassChain = mod.runBypassChain;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runBypassChain", () => {
  const baseOpts = {
    url: "https://target.com/page",
    context: mockContext as any,
    redis: mockRedis as any,
  };

  it("returns on first strategy success (plain-http)", async () => {
    const expected = { success: true, html: "<html>ok</html>", cookies: [], strategy: "plain-http" };
    mockPlainHttpFetch.mockResolvedValue(expected);

    const result = await runBypassChain(baseOpts);

    expect(result).toEqual(expected);
    expect(mockFetchWithCamoufox).not.toHaveBeenCalled();
    expect(mockFetchWithScrapling).not.toHaveBeenCalled();
  });

  it("escalates to patchright when plain-http detects challenge", async () => {
    mockPlainHttpFetch.mockRejectedValue(
      new mockChallengeDetectedError("cloudflare"),
    );
    // Patchright succeeds
    const page = {
      goto: vi.fn(),
      waitForTimeout: vi.fn(),
      content: vi.fn().mockResolvedValue("<html>solved</html>"),
      close: vi.fn(),
    };
    mockContext.newPage.mockResolvedValue(page);
    mockContext.cookies.mockResolvedValue([]);

    const { detectChallenge } = await import("../plain-http.js");
    (detectChallenge as any).mockReturnValue(null); // no challenge in result

    const result = await runBypassChain(baseOpts);

    expect(result.success).toBe(true);
  });

  it("escalates to camoufox when patchright fails", async () => {
    mockPlainHttpFetch.mockRejectedValue(
      new mockChallengeDetectedError("cloudflare"),
    );
    // Patchright fails
    const page = {
      goto: vi.fn().mockRejectedValue(new Error("timeout")),
      close: vi.fn(),
    };
    mockContext.newPage.mockResolvedValue(page);

    mockFetchWithCamoufox.mockResolvedValue({
      success: true,
      html: "<html>camoufox</html>",
      cookies: [],
    });

    const result = await runBypassChain(baseOpts);

    expect(result.success).toBe(true);
    expect(mockFetchWithCamoufox).toHaveBeenCalledWith("https://target.com/page", undefined);
  });

  it("falls back to scrapling as last resort", async () => {
    mockPlainHttpFetch.mockRejectedValue(
      new mockChallengeDetectedError("cloudflare"),
    );
    const page = {
      goto: vi.fn().mockRejectedValue(new Error("fail")),
      close: vi.fn(),
    };
    mockContext.newPage.mockResolvedValue(page);
    mockFetchWithCamoufox.mockRejectedValue(new Error("camoufox failed"));
    mockFetchWithScrapling.mockResolvedValue({
      success: true,
      html: "<html>scrapling</html>",
      cookies: [],
      strategy: "scrapling",
    });

    const result = await runBypassChain(baseOpts);

    expect(result.success).toBe(true);
    expect(mockFetchWithScrapling).toHaveBeenCalledWith("https://target.com/page");
  });
});
