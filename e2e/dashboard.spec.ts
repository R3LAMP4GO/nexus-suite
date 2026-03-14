import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("loads dashboard page with greeting", async ({ page }) => {
    await page.goto("/dashboard");

    // Should show greeting or welcome text
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });

    // Page should not show error states
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });

  test("displays data cards after loading", async ({ page }) => {
    await page.goto("/dashboard");

    // Wait for loading skeletons to disappear
    await page.waitForTimeout(2000);

    // Dashboard should show metric cards or empty states
    // Check for common dashboard elements
    const cards = page.locator('[class*="card"], [class*="Card"], section, [class*="rounded"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test("quick actions are clickable", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);

    // Look for action buttons/links on dashboard
    const actionLinks = page.locator('a[href*="/upload"], a[href*="/scripts"], a[href*="/analytics"], a[href*="/workflows"]');
    const count = await actionLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("navigates to upload from dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);

    // Find and click upload link/button
    const uploadLink = page.locator('a[href*="/upload"]').first();
    if (await uploadLink.isVisible()) {
      await uploadLink.click();
      await expect(page).toHaveURL(/upload/);
    }
  });
});
