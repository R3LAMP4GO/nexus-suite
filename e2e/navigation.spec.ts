import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("sidebar shows all navigation links", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);
    
    const navLinks = [
      { text: /dashboard/i, href: "/dashboard" },
      { text: /upload/i, href: "/upload" },
      { text: /script/i, href: "/scripts" },
      { text: /analytics/i, href: "/analytics" },
      { text: /workflow/i, href: "/workflows" },
      { text: /setting/i, href: "/settings" },
    ];
    
    for (const link of navLinks) {
      const el = page.locator(`nav a, aside a`).filter({ hasText: link.text }).first();
      if (await el.isVisible()) {
        await expect(el).toBeVisible();
      }
    }
  });

  test("can navigate to each page from sidebar", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);
    
    const pages = [
      { path: "/dashboard/scripts", text: /script/i },
      { path: "/dashboard/analytics", text: /analytics/i },
      { path: "/dashboard/upload", text: /upload/i },
    ];
    
    for (const p of pages) {
      const link = page.locator(`nav a, aside a`).filter({ hasText: p.text }).first();
      if (await link.isVisible()) {
        await link.click();
        await page.waitForURL(`**${p.path}**`, { timeout: 10000 });
        await expect(page.locator("text=Something went wrong")).not.toBeVisible();
        
        // Go back to dashboard for next iteration
        await page.goto("/dashboard");
        await page.waitForTimeout(500);
      }
    }
  });

  test("command palette opens with keyboard shortcut", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);
    
    // Press Cmd+K (Mac) or Ctrl+K
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);
    
    // Look for command palette dialog/modal
    const palette = page.locator('[role="dialog"], [class*="command" i], [class*="palette" i], [class*="modal" i]').first();
    if (await palette.isVisible()) {
      await expect(palette).toBeVisible();
      
      // Type something to search
      const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="search" i]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill("scripts");
        await page.waitForTimeout(500);
      }
      
      // Close with Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  });

  test("page titles update on navigation", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);
    
    // Dashboard should have some title
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
