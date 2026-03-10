import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock safety module ──────────────────────────────────────────
const mockEnforceToolScope = vi.fn();
const mockStripPII = vi.fn((input: string) => input);
const mockValidateNoCredentials = vi.fn();

vi.mock("../safety", () => ({
  enforceToolScope: (...args: unknown[]) => mockEnforceToolScope(...args),
  stripPII: (input: string) => mockStripPII(input),
  validateNoCredentials: (...args: unknown[]) => mockValidateNoCredentials(...args),
}));

import { wrapToolHandler, getRecentDiagnostics } from "../tool-wrappers";

beforeEach(() => {
  vi.resetAllMocks();
  // Restore default passthrough implementations after reset
  mockEnforceToolScope.mockImplementation(() => {});
  mockStripPII.mockImplementation((input: string) => input);
  mockValidateNoCredentials.mockImplementation(() => {});
});

describe("wrapToolHandler", () => {
  const handler = vi.fn(async (input: string) => `result:${input}`);
  const opts = { agentName: "seo-agent", toolName: "tavilySearch" };

  it("calls enforceToolScope with agent and tool name", async () => {
    const wrapped = wrapToolHandler(handler, opts);
    await wrapped("test query");

    expect(mockEnforceToolScope).toHaveBeenCalledWith("seo-agent", "tavilySearch");
  });

  it("throws when tool is out of scope", async () => {
    mockEnforceToolScope.mockImplementation(() => {
      throw new Error('Safety: agent "seo-agent" is not permitted');
    });

    const wrapped = wrapToolHandler(handler, opts);
    await expect(wrapped("test")).rejects.toThrow("not permitted");
  });

  it("strips PII from string inputs", async () => {
    mockStripPII.mockReturnValue("[EMAIL] sent data");

    const wrapped = wrapToolHandler(handler, opts);
    await wrapped("user@example.com sent data");

    expect(mockStripPII).toHaveBeenCalledWith("user@example.com sent data");
    expect(handler).toHaveBeenCalledWith("[EMAIL] sent data");
  });

  it("strips PII from top-level string fields of object input", async () => {
    mockStripPII.mockImplementation((s: string) =>
      s.includes("@") ? "[EMAIL]" : s,
    );

    const objHandler = vi.fn(async (input: { email: string; count: number }) => input);
    const wrapped = wrapToolHandler(objHandler, opts);

    await wrapped({ email: "foo@bar.com", count: 42 });

    expect(mockStripPII).toHaveBeenCalledWith("foo@bar.com");
    expect(objHandler).toHaveBeenCalledWith(
      expect.objectContaining({ email: "[EMAIL]", count: 42 }),
    );
  });

  it("checks output for credential leaks", async () => {
    const wrapped = wrapToolHandler(handler, opts);
    await wrapped("query");

    expect(mockValidateNoCredentials).toHaveBeenCalled();
  });

  it("throws on credential leak in output", async () => {
    mockValidateNoCredentials.mockImplementation(() => {
      throw new Error("Safety: credential leak detected");
    });

    const wrapped = wrapToolHandler(handler, opts);
    await expect(wrapped("query")).rejects.toThrow("credential leak");
  });

  it("records timing in diagnostics", async () => {
    handler.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "done";
    });

    const wrapped = wrapToolHandler(handler, opts);
    await wrapped("query");

    const diagnostics = getRecentDiagnostics(1);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.agentName).toBe("seo-agent");
    expect(diagnostics[0]!.toolName).toBe("tavilySearch");
    expect(diagnostics[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0]!.inputSize).toBeGreaterThan(0);
    expect(diagnostics[0]!.outputSize).toBeGreaterThan(0);
  });

  it("records error in diagnostics on failure", async () => {
    const failHandler = vi.fn(async () => {
      throw new Error("boom");
    });

    const wrapped = wrapToolHandler(failHandler, opts);
    await expect(wrapped("input")).rejects.toThrow("boom");

    const diagnostics = getRecentDiagnostics(1);
    expect(diagnostics[0]!.error).toBe("boom");
    expect(diagnostics[0]!.outputSize).toBe(0);
  });

  it("ring buffer caps at 1000 entries", async () => {
    const simpleHandler = vi.fn(async () => "ok");
    const wrapped = wrapToolHandler(simpleHandler, opts);

    for (let i = 0; i < 1005; i++) {
      await wrapped("x");
    }

    // getRecentDiagnostics returns from the buffer; buffer max is 1000
    const all = getRecentDiagnostics(2000);
    expect(all.length).toBeLessThanOrEqual(1000);
  });

  it("passes through non-string non-object inputs unchanged", async () => {
    const numHandler = vi.fn(async (n: number) => n * 2);
    const wrapped = wrapToolHandler(numHandler, opts);

    const result = await wrapped(42);
    expect(result).toBe(84);
    expect(mockStripPII).not.toHaveBeenCalled();
  });
});
