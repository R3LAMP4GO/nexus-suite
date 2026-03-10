// Integration test — requires ML sidecar running: docker compose up ml-sidecar
// The ML sidecar must be accessible at http://localhost:8000

import { describe, it, expect } from "vitest";

const ML_SIDECAR_URL = "http://localhost:8000";

describe("ML Sidecar Integration", () => {
  it("health check returns status", async () => {
    const res = await fetch(`${ML_SIDECAR_URL}/health`);
    const data = await res.json();
    expect(data.status).toBeDefined();
    expect(["healthy", "degraded"]).toContain(data.status);
  });

  it("selects a hook via Thompson Sampling", async () => {
    const res = await fetch(`${ML_SIDECAR_URL}/hooks/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: "test-org-ml",
        hook_ids: ["hook-a", "hook-b", "hook-c"],
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.selected_hook).toBeDefined();
    expect(["hook-a", "hook-b", "hook-c"]).toContain(data.selected_hook);
    expect(data.scores).toBeDefined();
    expect(Object.keys(data.scores)).toHaveLength(3);
    expect(data.state).toBeDefined();
  });

  it("rewards a hook and returns updated state", async () => {
    const res = await fetch(`${ML_SIDECAR_URL}/hooks/reward`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: "test-org-reward-single",
        hook_id: "hook-z",
        views: 10,
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.hook_id).toBe("hook-z");
    // Alpha should be 1 (prior) + 10 (reward) = 11
    expect(data.state.alpha).toBe(11);
    expect(data.state.beta).toBe(1);
  });

  it("updates weights after reward and favors rewarded hook", async () => {
    const orgId = `test-org-reward-${Date.now()}`;
    const hookIds = ["hook-x", "hook-y"];

    // Send 50 reward views to hook-x only
    const rewardRes = await fetch(`${ML_SIDECAR_URL}/hooks/reward`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, hook_id: "hook-x", views: 50 }),
    });
    expect(rewardRes.ok).toBe(true);

    // Sample 20 times and count how often hook-x is selected
    let hookXCount = 0;
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${ML_SIDECAR_URL}/hooks/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, hook_ids: hookIds }),
      });
      const data = await res.json();
      if (data.selected_hook === "hook-x") hookXCount++;
    }

    // hook-x should be selected significantly more often (alpha=51 vs alpha=1)
    // With 20 samples, we expect at least 14 selections (70%)
    expect(hookXCount).toBeGreaterThanOrEqual(14);
  });

  it("bandit predict endpoint works", async () => {
    const res = await fetch(`${ML_SIDECAR_URL}/predict/bandit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: "test-org-bandit",
        arms: ["arm-1", "arm-2"],
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.selected_arm).toBeDefined();
    expect(["arm-1", "arm-2"]).toContain(data.selected_arm);
    expect(data.scores).toBeDefined();
  });

  it("bandit feedback endpoint works", async () => {
    const res = await fetch(`${ML_SIDECAR_URL}/feedback/bandit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: "test-org-feedback",
        arm: "arm-1",
        success: true,
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.arm).toBe("arm-1");
    expect(data.state.alpha).toBeGreaterThan(1);
  });
});
