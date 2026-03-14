import { test, expect } from "@playwright/test";

test.describe("Analytics", () => {
  test("loads analytics page", async ({ page }) => {
    await page.goto("/dashboard/analytics");
    
    // Should show analytics header
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });

  test("shows empty state or platform data", async ({ page }) => {
    await page.goto("/dashboard/analytics");
    await page.waitForTimeout(3000);
    
    // Should show either platform cards or an empty state message
    const hasContent = await page.locator('[class*="card"], [class*="Card"], section').count();
    const hasEmpty = await page.locator('text=/no.*data|connect.*account|no.*posts|empty/i').count();
    
    // One of these should be true
    expect(hasContent + hasEmpty).toBeGreaterThan(0);
  });

  test("does not crash on navigation", async ({ page }) => {
    // Navigate from dashboard to analytics
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);
    
    const analyticsLink = page.locator('a[href*="/analytics"]').first();
    if (await analyticsLink.isVisible()) {
      await analyticsLink.click();
      await expect(page).toHaveURL(/analytics/);
      await expect(page.locator("text=Something went wrong")).not.toBeVisible();
    }
  });
});
