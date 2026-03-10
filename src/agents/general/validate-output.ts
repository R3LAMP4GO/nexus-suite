// Validates agent output text against the expected Zod schema.
// Returns parsed structured data or validation errors.

import { AGENT_OUTPUT_SCHEMAS } from "./output-schemas";

export interface ValidationSuccess {
  valid: true;
  parsed: unknown;
}

export interface ValidationFailure {
  valid: false;
  errors: string[];
  rawText: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Extract JSON from agent raw text output.
 * Handles markdown code blocks, leading prose, and raw JSON.
 */
function extractJson(rawText: string): string | null {
  // Try markdown code block first: ```json ... ``` or ``` ... ```
  const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try finding first { ... } or [ ... ] block
  const jsonStart = rawText.search(/[{\[]/);
  if (jsonStart === -1) return null;

  const candidate = rawText.slice(jsonStart);
  // Find matching closing brace/bracket
  const openChar = candidate[0];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;
    if (depth === 0) return candidate.slice(0, i + 1);
  }

  return null;
}

/**
 * Validate agent output against its registered schema.
 * Agents without a schema always pass validation.
 */
export function validateAgentOutput(
  agentName: string,
  rawText: string,
): ValidationResult {
  const schema = AGENT_OUTPUT_SCHEMAS[agentName];

  // No schema defined for this agent — pass through
  if (!schema) {
    return { valid: true, parsed: rawText };
  }

  const jsonStr = extractJson(rawText);
  if (!jsonStr) {
    return {
      valid: false,
      errors: [
        `No JSON found in output. Expected structured JSON matching the ${agentName} schema.`,
      ],
      rawText,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return {
      valid: false,
      errors: [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`],
      rawText,
    };
  }

  const result = schema.safeParse(parsed);
  if (result.success) {
    return { valid: true, parsed: result.data };
  }

  return {
    valid: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    ),
    rawText,
  };
}

/**
 * Build a retry prompt suffix that instructs the agent to fix its output format.
 */
export function buildRetryPrompt(
  agentName: string,
  errors: string[],
): string {
  return [
    "\n\n--- FORMAT ERROR ---",
    "Your previous response did not match the required JSON format.",
    "Errors:",
    ...errors.map((e) => `  - ${e}`),
    "",
    "Please respond with ONLY valid JSON (no markdown, no explanation outside the JSON).",
    `Agent: ${agentName}`,
  ].join("\n");
}
