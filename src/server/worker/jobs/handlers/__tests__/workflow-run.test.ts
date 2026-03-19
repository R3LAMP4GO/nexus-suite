import { describe, it, expect, vi, beforeEach } from "vitest";

const executeWorkflowMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());
const readdirSyncMock = vi.hoisted(() => vi.fn());
const readFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/workflows/executor", () => ({
  executeWorkflow: executeWorkflowMock,
}));

vi.mock("fs", () => ({
  existsSync: existsSyncMock,
  readdirSync: readdirSyncMock,
  readFileSync: readFileSyncMock,
}));

vi.mock("yaml", () => ({
  parse: vi.fn((raw: string) => JSON.parse(raw)),
}));

import { handleWorkflowRun, loadOrgWorkflows } from "../workflow-run";

function makeJob(data: Record<string, unknown>) {
  return { id: "job_1", name: "workflow:run", data } as any;
}

describe("loadOrgWorkflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads workflows from org directory", () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock
      .mockReturnValueOnce(["wf1.yaml"]) // org dir
      .mockReturnValueOnce([]); // global dir
    readFileSyncMock.mockReturnValue(JSON.stringify({ name: "test-wf", steps: [] }));

    const workflows = loadOrgWorkflows("org_1");
    expect(workflows).toHaveLength(1);
    expect(workflows[0].name).toBe("test-wf");
  });

  it("skips global workflow if org has same-named one", () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock
      .mockReturnValueOnce(["wf1.yaml"]) // org dir
      .mockReturnValueOnce(["wf1.yaml"]); // global dir
    readFileSyncMock.mockReturnValue(JSON.stringify({ name: "same-name", steps: [] }));

    const workflows = loadOrgWorkflows("org_1");
    expect(workflows).toHaveLength(1);
  });

  it("returns empty array when no directories exist", () => {
    existsSyncMock.mockReturnValue(false);
    const workflows = loadOrgWorkflows("org_1");
    expect(workflows).toEqual([]);
  });
});

describe("handleWorkflowRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no workflows found
    existsSyncMock.mockReturnValue(false);
  });

  it("throws when workflow not found", async () => {
    await expect(
      handleWorkflowRun(makeJob({
        workflowName: "missing-wf",
        organizationId: "org_1",
        triggeredAt: new Date().toISOString(),
      })),
    ).rejects.toThrow('Workflow "missing-wf" not found');
  });

  it("executes found workflow", async () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock
      .mockReturnValueOnce(["wf.yaml"])
      .mockReturnValueOnce([]);
    readFileSyncMock.mockReturnValue(JSON.stringify({ name: "my-wf", steps: [] }));
    executeWorkflowMock.mockResolvedValue({ status: "completed", durationMs: 100 });

    await handleWorkflowRun(makeJob({
      workflowName: "my-wf",
      organizationId: "org_1",
      triggeredAt: new Date().toISOString(),
    }));
    expect(executeWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "my-wf", organizationId: "org_1" }),
    );
  });

  it("throws when workflow execution fails", async () => {
    existsSyncMock.mockReturnValue(true);
    readdirSyncMock
      .mockReturnValueOnce(["wf.yaml"])
      .mockReturnValueOnce([]);
    readFileSyncMock.mockReturnValue(JSON.stringify({ name: "fail-wf", steps: [] }));
    executeWorkflowMock.mockResolvedValue({
      status: "failed",
      durationMs: 50,
      error: "step timeout",
    });

    await expect(
      handleWorkflowRun(makeJob({
        workflowName: "fail-wf",
        organizationId: "org_1",
        triggeredAt: new Date().toISOString(),
      })),
    ).rejects.toThrow("status=failed");
  });
});
