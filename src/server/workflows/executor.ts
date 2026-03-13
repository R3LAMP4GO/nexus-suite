import { workflowLogger } from "@/lib/logger";
import { parse as parseYaml } from "yaml";
import type {
  WorkflowDefinition,
  Step,
  ActionStep,
  AgentDelegateStep,
} from "./workflow-schema";
import {
  type StepResult,
  type WorkflowContext,
  type StepExecutor,
  executeCondition,
  executeForEach,
  executeWhile,
  executeParallel,
} from "./control-flow";
import { interpolate, interpolateParams } from "./interpolation";
import { validateWorkflow } from "./validator";
import { executeAgentDelegate } from "./agent-delegate";
import { checkLlmBudget } from "../services/llm-budget";
import { incrementUsage } from "../services/usage-tracking";
import { sendScriptReadyEmail } from "../services/notifications";
import { publishSSE } from "../services/sse-broadcaster";
import { db } from "@/lib/db";
import { loadBrandPrompt } from "@/agents/general/brand-loader";
import { validateAgentOutput, buildRetryPrompt } from "@/agents/general/validate-output";

export interface WorkflowRunResult {
  runId: string;
  workflowName: string;
  organizationId: string;
  status: "completed" | "failed" | "aborted";
  steps: StepResult[];
  variables: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  error?: string;
}

// Module registry: maps "service.method" → handler
export type ActionHandler = (
  params: Record<string, unknown>,
  context: WorkflowContext,
) => Promise<unknown>;

const actionRegistry = new Map<string, ActionHandler>();

export function registerAction(name: string, handler: ActionHandler) {
  actionRegistry.set(name, handler);
}

// ── Main Executor ────────────────────────────────────────────────

export async function executeWorkflow(
  definition: WorkflowDefinition | string,
  inputData?: Record<string, unknown>,
): Promise<WorkflowRunResult> {
  // Parse YAML if string
  const workflow: WorkflowDefinition =
    typeof definition === "string" ? parseYaml(definition) : definition;

  // Validate
  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    throw new Error(
      `Workflow validation failed:\n${validation.errors.map((e) => `  [${e.layer}] ${e.path}: ${e.message}`).join("\n")}`,
    );
  }

  const startedAt = new Date();

  // Create WorkflowRun record in DB
  const workflowRun = await db.workflowRun.create({
    data: {
      workflowName: workflow.name,
      organizationId: workflow.organizationId,
      status: "RUNNING",
      triggeredBy: (inputData?.triggeredBy as string) ?? "system",
      startedAt,
      metadata: inputData ? (inputData as unknown as any) : undefined,
    },
  });

  const runId = workflowRun.id;

  // Load brand voice from client plugin directory (if exists)
  const brandVoice = loadBrandPrompt(workflow.organizationId);

  const context: WorkflowContext = {
    organizationId: workflow.organizationId,
    workflowName: workflow.name,
    runId,
    variables: {},
    config: (workflow.config ?? {}) as Record<string, unknown>,
    input: inputData ?? {},
    aborted: false,
    brandVoice: brandVoice ?? undefined,
  };

  // Merge config and input into variables for interpolation access
  context.variables.config = context.config;
  context.variables.input = context.input;

  const allResults: StepResult[] = [];

  try {
    // Build dependency graph → execute in waves
    const waves = buildExecutionWaves(workflow.steps);

    for (const wave of waves) {
      if (context.aborted) break;

      if (wave.length === 1) {
        // Single step — execute sequentially
        const result = await executeStepWithLog(wave[0], context, runId);
        if (Array.isArray(result)) {
          allResults.push(...result);
        } else {
          allResults.push(result);
          // Store output
          if (wave[0].outputAs && result.output !== undefined) {
            context.variables[wave[0].outputAs] = result.output;
          }
        }
      } else {
        // Multiple steps with no inter-dependencies — execute in parallel
        const promises = wave.map((step) => executeStepWithLog(step, context, runId));
        const settled = await Promise.allSettled(promises);

        for (let i = 0; i < settled.length; i++) {
          const s = settled[i];
          const step = wave[i];
          if (s.status === "fulfilled") {
            if (Array.isArray(s.value)) {
              allResults.push(...s.value);
            } else {
              allResults.push(s.value);
              if (step.outputAs && s.value.output !== undefined) {
                context.variables[step.outputAs] = s.value.output;
              }
            }
          } else {
            allResults.push({
              stepId: step.id,
              status: "error",
              error: String(s.reason),
              durationMs: 0,
            });
          }
        }
      }
    }
  } catch (err) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // Update WorkflowRun as FAILED
    await db.workflowRun.update({
      where: { id: runId },
      data: { status: "FAILED", completedAt, durationMs, error: String(err), variables: context.variables as any },
    }).catch((e) => workflowLogger.error({ err: e }, "Failed to update WorkflowRun"));

    await publishSSE(workflow.organizationId, "workflow:complete", {
      workflowName: workflow.name,
      status: "failed",
    }).catch(() => {});

    // Legacy log
    await db.workflowRunLog.create({
      data: {
        organizationId: workflow.organizationId,
        runId,
        workflowName: workflow.name,
        status: "failed",
        startedAt,
        completedAt,
        durationMs,
        error: String(err),
        steps: allResults as unknown as any,
        variables: context.variables as unknown as any,
      },
    }).catch((e) => workflowLogger.error({ err: e }, "Failed to persist WorkflowRunLog"));

    return {
      runId,
      workflowName: workflow.name,
      organizationId: workflow.organizationId,
      status: "failed",
      steps: allResults,
      variables: context.variables,
      startedAt,
      completedAt,
      durationMs,
      error: String(err),
    };
  }

  const completedAt = new Date();
  const hasErrors = allResults.some((r) => r.status === "error");
  const finalStatus = context.aborted ? "aborted" : hasErrors ? "failed" : "completed";
  const durationMs = completedAt.getTime() - startedAt.getTime();

  // Update WorkflowRun with final status
  const dbStatus = finalStatus === "aborted" ? "CANCELLED" : finalStatus === "failed" ? "FAILED" : "COMPLETED";
  await db.workflowRun.update({
    where: { id: runId },
    data: {
      status: dbStatus,
      completedAt,
      durationMs,
      error: context.abortReason ?? null,
      variables: context.variables as any,
    },
  }).catch((e) => workflowLogger.error({ err: e }, "Failed to update WorkflowRun"));

  await publishSSE(workflow.organizationId, "workflow:complete", {
    workflowName: workflow.name,
    status: finalStatus,
  }).catch(() => {});

  if (finalStatus === "completed") {
    await incrementUsage(workflow.organizationId, "workflow_runs").catch(() => {});
  }

  const result: WorkflowRunResult = {
    runId,
    workflowName: workflow.name,
    organizationId: workflow.organizationId,
    status: finalStatus,
    steps: allResults,
    variables: context.variables,
    startedAt,
    completedAt,
    durationMs,
    error: context.abortReason,
  };

  // Persist to legacy WorkflowRunLog for backwards compatibility
  await db.workflowRunLog.create({
    data: {
      organizationId: workflow.organizationId,
      runId,
      workflowName: workflow.name,
      status: finalStatus,
      startedAt,
      completedAt,
      durationMs: result.durationMs,
      error: result.error ?? null,
      steps: allResults as unknown as any,
      variables: context.variables as unknown as any,
    },
  }).catch((err) => {
    workflowLogger.error({ err }, "Failed to persist WorkflowRunLog");
  });

  return result;
}

// ── Step Logger Wrapper ──────────────────────────────────────────

async function executeStepWithLog(
  step: Step,
  context: WorkflowContext,
  runId: string,
): Promise<StepResult | StepResult[]> {
  const stepStartedAt = new Date();

  // Create step log record as RUNNING
  const stepLog = await db.workflowStepLog.create({
    data: {
      runId,
      stepName: step.id,
      stepType: step.type,
      agentId: step.type === "agent-delegate" ? (step as AgentDelegateStep).agent : null,
      status: "RUNNING",
      input: step.type === "action"
        ? ((step as ActionStep).params as unknown as any ?? undefined)
        : step.type === "agent-delegate"
          ? ({ prompt: (step as AgentDelegateStep).prompt } as any)
          : undefined,
      startedAt: stepStartedAt,
    },
  }).catch((err) => {
    workflowLogger.error({ err }, "Failed to create WorkflowStepLog");
    return null;
  });

  // Execute the actual step
  const result = await executeStep(step, context);

  // Determine final status and extract data from result
  const completedAt = new Date();
  const primaryResult = Array.isArray(result) ? result[0] : result;
  const stepStatus = primaryResult?.status === "success" ? "COMPLETED"
    : primaryResult?.status === "skipped" ? "SKIPPED"
    : "FAILED";

  // Update step log with outcome
  if (stepLog) {
    await db.workflowStepLog.update({
      where: { id: stepLog.id },
      data: {
        status: stepStatus,
        output: primaryResult?.output !== undefined
          ? (primaryResult.output as unknown as any)
          : undefined,
        error: primaryResult?.error ?? null,
        durationMs: primaryResult?.durationMs ?? (completedAt.getTime() - stepStartedAt.getTime()),
        completedAt,
      },
    }).catch((err) => {
      workflowLogger.error({ err }, "Failed to update WorkflowStepLog");
    });
  }

  return result;
}

// ── Step Dispatcher ──────────────────────────────────────────────

async function executeStep(
  step: Step,
  context: WorkflowContext,
): Promise<StepResult | StepResult[]> {
  if (context.aborted) {
    return { stepId: step.id, status: "skipped", durationMs: 0 };
  }

  switch (step.type) {
    case "action":
      return executeAction(step, context);

    case "agent-delegate":
      return executeAgentDelegateStep(step, context);

    case "condition":
      return executeCondition(step, context, executeStep as StepExecutor);

    case "forEach":
      return executeForEach(step, context, executeStep as StepExecutor);

    case "while":
      return executeWhile(step, context, executeStep as StepExecutor);

    case "parallel":
      return executeParallel(step, context, executeStep as StepExecutor);

    default:
      return {
        stepId: step.id,
        status: "error",
        error: `Unknown step type: ${(step as any).type}`,
        durationMs: 0,
      };
  }
}

// ── Action Step ──────────────────────────────────────────────────

async function executeAction(step: ActionStep, context: WorkflowContext): Promise<StepResult> {
  const start = Date.now();

  const handler = actionRegistry.get(step.action);
  if (!handler) {
    return {
      stepId: step.id,
      status: "error",
      error: `No action handler registered for "${step.action}"`,
      durationMs: Date.now() - start,
    };
  }

  const params = step.params
    ? interpolateParams(step.params, context.variables)
    : {};

  let lastError: string | undefined;
  const maxAttempts = (step.retries ?? 0) + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const output = await withTimeout(
        handler(params, context),
        step.timeoutMs ?? 300_000, // 5min default
      );

      return {
        stepId: step.id,
        status: "success",
        output,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      lastError = String(err);
      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s, 4s...
        await sleep(Math.pow(2, attempt - 1) * 1000);
      }
    }
  }

  return {
    stepId: step.id,
    status: "error",
    error: lastError,
    durationMs: Date.now() - start,
  };
}

// ── Agent Delegate Step (with LLM budget check) ──────────────────

async function executeAgentDelegateStep(
  step: AgentDelegateStep,
  context: WorkflowContext,
): Promise<StepResult> {
  const start = Date.now();

  // Pre-flight LLM budget check (Decision 10 enforcement point)
  const budgetCheck = await checkLlmBudget(context.organizationId);
  if (!budgetCheck.allowed) {
    context.aborted = true;
    context.abortReason = `LLM_BUDGET_EXCEEDED: ${budgetCheck.message}`;
    return {
      stepId: step.id,
      status: "error",
      error: context.abortReason,
      durationMs: Date.now() - start,
    };
  }

  const resolvedPrompt = interpolate(step.prompt, context.variables);
  const maxValidationRetries = step.retries ?? 1; // Allow 1 retry for format issues

  try {
    let currentPrompt = resolvedPrompt;
    let output: unknown;
    let validatedOutput: unknown;

    for (let attempt = 0; attempt <= maxValidationRetries; attempt++) {
      output = await executeAgentDelegate(
        step.agent,
        currentPrompt,
        context,
        step.model,
        step.maxTokens,
      );

      // Extract text for validation
      const outputText = output && typeof output === "object" && "text" in output
        ? String((output as Record<string, unknown>).text)
        : typeof output === "string" ? output : "";

      const validation = validateAgentOutput(step.agent, outputText);

      if (validation.valid) {
        validatedOutput = validation.parsed;
        break;
      }

      // Last attempt — return what we have with a warning
      if (attempt >= maxValidationRetries) {
        workflowLogger.warn(
          { agent: step.agent, attempts: attempt + 1, errors: validation.errors },
          "Agent output failed schema validation",
        );
        validatedOutput = output; // Use raw output as fallback
        break;
      }

      // Retry with format correction prompt
      currentPrompt = resolvedPrompt + buildRetryPrompt(step.agent, validation.errors);
    }

    // Notify org owner when script-agent generates a script successfully
    if (step.agent === "script-agent") {
      notifyScriptReady(context.organizationId, validatedOutput ?? output).catch((err) => {
        workflowLogger.error({ err }, "Failed to send script ready email");
      });
    }

    return {
      stepId: step.id,
      status: "success",
      output: validatedOutput ?? output,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      stepId: step.id,
      status: "error",
      error: String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ── Dependency Graph → Wave Decomposition ────────────────────────

function buildExecutionWaves(steps: Step[]): Step[][] {
  const waves: Step[][] = [];
  const completed = new Set<string>();
  const remaining = [...steps];

  while (remaining.length > 0) {
    const wave: Step[] = [];
    const waveIds: string[] = [];

    for (let i = remaining.length - 1; i >= 0; i--) {
      const step = remaining[i];
      const deps = step.dependsOn ?? [];
      const allDepsMet = deps.every((d: string) => completed.has(d));

      if (allDepsMet) {
        wave.push(step);
        waveIds.push(step.id);
        remaining.splice(i, 1);
      }
    }

    if (wave.length === 0 && remaining.length > 0) {
      // Deadlock: remaining steps have unresolvable dependencies
      throw new Error(
        `Deadlock: steps [${remaining.map((s) => s.id).join(", ")}] have unresolvable dependencies`,
      );
    }

    for (const id of waveIds) completed.add(id);
    waves.push(wave);
  }

  return waves;
}

// ── Utilities ────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Step timed out after ${ms}ms`)), ms);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Notification Hooks ───────────────────────────────────────────

async function notifyScriptReady(organizationId: string, output: unknown): Promise<void> {
  // Extract script title from agent output
  const title =
    (output && typeof output === "object" && "title" in output
      ? String((output as Record<string, unknown>).title)
      : null) ?? "New Script";

  // Look up org owner email
  const owner = await db.orgMember.findFirst({
    where: { organizationId, role: "OWNER" },
    select: { user: { select: { email: true } } },
  });

  if (owner?.user?.email) {
    await sendScriptReadyEmail(owner.user.email, title);
  }
}
