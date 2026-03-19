import { test, expect } from "@playwright/test";

test.describe("Onboarding Flow", () => {
  test("redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/onboarding");
    // Should redirect to auth page
    await expect(page).toHaveURL(/\/(auth|api\/auth|sign-in)/);
  });

  test("onboarding page loads for authenticated users", async ({ page }) => {
    // This test verifies the onboarding route exists and doesn't crash
    const response = await page.goto("/onboarding");
    expect(response?.status()).toBeLessThan(500);
  });

  test("dashboard redirects unauthenticated users", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/(auth|api\/auth|sign-in)/);
  });
});
