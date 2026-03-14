import { test, expect } from "@playwright/test";

test.describe("Upload / Magic Dropzone", () => {
  test("loads upload page", async ({ page }) => {
    await page.goto("/dashboard/upload");
    
    // Should show upload page with dropzone
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });

  test("shows dropzone area", async ({ page }) => {
    await page.goto("/dashboard/upload");
    await page.waitForTimeout(1000);
    
    // Look for dropzone indicators (drag-drop text, upload icon, file input)
    const dropzone = page.locator('text=/drag|drop|upload|browse/i, input[type="file"], [class*="dropzone" i], [class*="upload" i]').first();
    await expect(dropzone).toBeVisible({ timeout: 5000 });
  });

  test("file input accepts video types", async ({ page }) => {
    await page.goto("/dashboard/upload");
    await page.waitForTimeout(1000);
    
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      const accept = await fileInput.getAttribute("accept");
      // Should accept video files
      if (accept) {
        expect(accept).toMatch(/video|mp4|mov|avi|webm/i);
      }
    }
  });
});
