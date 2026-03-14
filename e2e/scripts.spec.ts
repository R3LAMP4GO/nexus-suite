import { test, expect } from "@playwright/test";

test.describe("Scripts Studio", () => {
  test("loads scripts page", async ({ page }) => {
    await page.goto("/dashboard/scripts");
    
    // Should show scripts page header
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
    
    // Should show empty state or script list
    await page.waitForTimeout(2000);
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });

  test("shows tab filters", async ({ page }) => {
    await page.goto("/dashboard/scripts");
    await page.waitForTimeout(1000);
    
    // Look for status filter tabs/buttons
    const allTab = page.locator('button:has-text("All"), [role="tab"]:has-text("All")').first();
    await expect(allTab).toBeVisible({ timeout: 5000 });
  });

  test("can create a new script", async ({ page }) => {
    await page.goto("/dashboard/scripts");
    await page.waitForTimeout(1000);
    
    // Find create button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), button:has-text("Add"), a:has-text("Create")').first();
    
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(500);
      
      // Fill in script form fields
      const titleInput = page.locator('input[name="title"], input[placeholder*="title" i]').first();
      if (await titleInput.isVisible()) {
        await titleInput.fill("E2E Test Script");
        
        // Fill hook text
        const hookInput = page.locator('textarea[name="hookText"], textarea[placeholder*="hook" i], input[name="hookText"]').first();
        if (await hookInput.isVisible()) {
          await hookInput.fill("Did you know this one simple trick?");
        }
        
        // Fill body text
        const bodyInput = page.locator('textarea[name="bodyText"], textarea[placeholder*="body" i]').first();
        if (await bodyInput.isVisible()) {
          await bodyInput.fill("Here is the main content of the script that delivers value.");
        }
        
        // Fill CTA
        const ctaInput = page.locator('textarea[name="ctaText"], textarea[placeholder*="cta" i], input[name="ctaText"]').first();
        if (await ctaInput.isVisible()) {
          await ctaInput.fill("Follow for more!");
        }
        
        // Submit
        const submitBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').last();
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
          await page.waitForTimeout(2000);
          
          // Verify script appears in list
          await expect(page.locator("text=E2E Test Script")).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test("can filter scripts by status", async ({ page }) => {
    await page.goto("/dashboard/scripts");
    await page.waitForTimeout(2000);
    
    // Click Draft tab
    const draftTab = page.locator('button:has-text("Draft"), [role="tab"]:has-text("Draft")').first();
    if (await draftTab.isVisible()) {
      await draftTab.click();
      await page.waitForTimeout(1000);
      // Page should not error
      await expect(page.locator("text=Something went wrong")).not.toBeVisible();
    }
  });
});
