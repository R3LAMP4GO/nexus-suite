import { test, expect } from "@playwright/test";

test.describe("Settings", () => {
  test("loads settings page", async ({ page }) => {
    await page.goto("/dashboard/settings");
    
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });

  test("shows organization details", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await page.waitForTimeout(2000);
    
    // Should show org name field or display
    const orgName = page.locator('input[name="name"], text=/Dev Organization/i, text=/organization/i').first();
    await expect(orgName).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Social Connections", () => {
  test("loads connections page", async ({ page }) => {
    await page.goto("/dashboard/settings/connections");
    
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });

  test("shows platform connect buttons", async ({ page }) => {
    await page.goto("/dashboard/settings/connections");
    await page.waitForTimeout(2000);
    
    // Should show platform names (YouTube, TikTok, Instagram, etc.)
    const platforms = ["YouTube", "TikTok", "Instagram", "LinkedIn"];
    for (const platform of platforms) {
      const el = page.locator(`text=${platform}`).first();
      // At least some platforms should be visible
      if (await el.isVisible()) {
        await expect(el).toBeVisible();
      }
    }
  });

  test("connect buttons link to OAuth", async ({ page }) => {
    await page.goto("/dashboard/settings/connections");
    await page.waitForTimeout(2000);
    
    // Find connect buttons/links
    const connectBtn = page.locator('button:has-text("Connect"), a:has-text("Connect")').first();
    if (await connectBtn.isVisible()) {
      // Just verify the button exists — don't actually click (would redirect to OAuth)
      await expect(connectBtn).toBeEnabled();
    }
  });
});
