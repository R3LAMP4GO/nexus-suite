import { describe, it, expect } from "vitest";
import { validateAgentOutput, buildRetryPrompt } from "../validate-output";

describe("validateAgentOutput", () => {
  describe("JSON extraction", () => {
    it("extracts JSON from markdown code block", () => {
      const raw = 'Here is the result:\n```json\n{"hooks": ["test hook"]}\n```';
      const result = validateAgentOutput("hook-writer", raw);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.parsed).toEqual({ hooks: ["test hook"] });
      }
    });

    it("extracts JSON from code block without json tag", () => {
      const raw = '```\n{"hooks": ["test"]}\n```';
      const result = validateAgentOutput("hook-writer", raw);
      expect(result.valid).toBe(true);
    });

    it("extracts raw JSON without code blocks", () => {
      const raw = '{"hooks": ["direct json"]}';
      const result = validateAgentOutput("hook-writer", raw);
      expect(result.valid).toBe(true);
    });

    it("extracts JSON with leading prose", () => {
      const raw = 'Here are the hooks I generated:\n{"hooks": ["hook1"]}';
      const result = validateAgentOutput("hook-writer", raw);
      expect(result.valid).toBe(true);
    });

    it("handles nested braces correctly", () => {
      const raw = '{"score": 85, "feedback": "good {quality}", "pass": true}';
      const result = validateAgentOutput("quality-scorer", raw);
      expect(result.valid).toBe(true);
    });
  });

  describe("schema validation", () => {
    it("passes for valid hook-writer output", () => {
      const raw = '{"hooks": ["Great hook 1", "Amazing hook 2"]}';
      const result = validateAgentOutput("hook-writer", raw);
      expect(result.valid).toBe(true);
    });

    it("fails for invalid hook-writer output (empty hooks array)", () => {
      const raw = '{"hooks": []}';
      const result = validateAgentOutput("hook-writer", raw);
      expect(result.valid).toBe(false);
    });

    it("fails when no JSON found in output", () => {
      const result = validateAgentOutput("hook-writer", "Just some text with no JSON");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]).toContain("No JSON found");
      }
    });

    it("fails for malformed JSON", () => {
      const result = validateAgentOutput("hook-writer", '{"hooks": [broken]}');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]).toContain("Invalid JSON");
      }
    });

    it("passes through agents without registered schema", () => {
      const result = validateAgentOutput("unknown-agent", "any text");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.parsed).toBe("any text");
      }
    });

    it("validates script-agent schema", () => {
      const raw = '{"hook": "test hook", "body": "test body", "cta": "test cta"}';
      const result = validateAgentOutput("script-agent", raw);
      expect(result.valid).toBe(true);
    });

    it("fails script-agent with missing required fields", () => {
      const raw = '{"hook": "test hook"}';
      const result = validateAgentOutput("script-agent", raw);
      expect(result.valid).toBe(false);
    });
  });
});

describe("buildRetryPrompt", () => {
  it("includes agent name", () => {
    const prompt = buildRetryPrompt("hook-writer", ["missing field: hooks"]);
    expect(prompt).toContain("hook-writer");
  });

  it("includes all error messages", () => {
    const errors = ["error 1", "error 2"];
    const prompt = buildRetryPrompt("test-agent", errors);
    expect(prompt).toContain("error 1");
    expect(prompt).toContain("error 2");
  });

  it("includes format instructions", () => {
    const prompt = buildRetryPrompt("test-agent", ["err"]);
    expect(prompt).toContain("FORMAT ERROR");
    expect(prompt).toContain("valid JSON");
  });
});
