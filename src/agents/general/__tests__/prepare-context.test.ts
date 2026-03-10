import { describe, it, expect } from "vitest";
import { prepareContext, CLIENT_PLUGIN_WHITELIST } from "../prepare-context";

const fullContext = {
  organizationId: "org_1",
  workflowName: "test-workflow",
  runId: "run_123",
  input: { topic: "AI trends" },
  variables: { lang: "en" },
  config: { model: "gpt-4" },
};

describe("prepareContext", () => {
  // ── Tier 1: Full access ──────────────────────────────────────
  it("orchestrator gets all fields", () => {
    const result = prepareContext(fullContext, "orchestrator");
    expect(result).toEqual(fullContext);
  });

  it("workflow-agent gets all fields", () => {
    const result = prepareContext(fullContext, "workflow-agent");
    expect(result).toEqual(fullContext);
  });

  // ── Tier 2: orgId + input + variables ────────────────────────
  it("youtube-main gets orgId, input, variables only", () => {
    const result = prepareContext(fullContext, "youtube-main");
    expect(result).toEqual({
      organizationId: "org_1",
      input: { topic: "AI trends" },
      variables: { lang: "en" },
    });
    expect(result).not.toHaveProperty("config");
    expect(result).not.toHaveProperty("workflowName");
    expect(result).not.toHaveProperty("runId");
  });

  it("tiktok-main gets orgId, input, variables only", () => {
    const result = prepareContext(fullContext, "tiktok-main");
    expect(Object.keys(result)).toEqual(["organizationId", "input", "variables"]);
  });

  // ── Tier 3: orgId + input only ───────────────────────────────
  it("seo-agent gets orgId and input only", () => {
    const result = prepareContext(fullContext, "seo-agent");
    expect(result).toEqual({
      organizationId: "org_1",
      input: { topic: "AI trends" },
    });
  });

  it("hook-writer gets orgId and input only", () => {
    const result = prepareContext(fullContext, "hook-writer");
    expect(Object.keys(result)).toEqual(["organizationId", "input"]);
  });

  // ── Tier 2.5: sub-agents same as specialists ────────────────
  it("news-scout gets orgId and input only", () => {
    const result = prepareContext(fullContext, "news-scout");
    expect(Object.keys(result)).toEqual(["organizationId", "input"]);
  });

  it("sound-selector gets orgId and input only", () => {
    const result = prepareContext(fullContext, "sound-selector");
    expect(Object.keys(result)).toEqual(["organizationId", "input"]);
  });

  // ── Client plugins: most restrictive ────────────────────────
  it("CLIENT_PLUGIN_WHITELIST contains only orgId and input", () => {
    expect(CLIENT_PLUGIN_WHITELIST).toEqual(["organizationId", "input"]);
  });

  // ── Unknown agent fallback ──────────────────────────────────
  it("unknown agent gets default whitelist (orgId, input, variables)", () => {
    const result = prepareContext(fullContext, "some-unknown-agent");
    expect(result).toEqual({
      organizationId: "org_1",
      input: { topic: "AI trends" },
      variables: { lang: "en" },
    });
  });

  // ── Overloaded call signatures ──────────────────────────────
  it("supports specialist style: prepareContext(agentName, rawContext)", () => {
    const rawContext = {
      organizationId: "org_2",
      userPrompt: "Write a hook",
      brandVoice: "casual",
    };
    const result = prepareContext("hook-writer", rawContext);
    expect(result).toEqual({ organizationId: "org_2" });
    expect(result).not.toHaveProperty("userPrompt");
    expect(result).not.toHaveProperty("brandVoice");
  });

  it("handles missing context keys gracefully", () => {
    const partial = { organizationId: "org_1" } as any;
    const result = prepareContext(partial, "orchestrator");
    expect(result).toEqual({ organizationId: "org_1" });
  });
});
