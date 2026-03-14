import { test, expect } from "@playwright/test";

// Override storageState to empty — these tests run unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Auth Guards", () => {
  test("redirects unauthenticated user from dashboard to login", async ({ page }) => {
    await page.goto("/dashboard");
    
    // Should redirect to login
    await page.waitForURL("**/login**", { timeout: 10000 });
    await expect(page).toHaveURL(/login/);
  });

  test("redirects unauthenticated user from scripts to login", async ({ page }) => {
    await page.goto("/dashboard/scripts");
    
    await page.waitForURL("**/login**", { timeout: 10000 });
    await expect(page).toHaveURL(/login/);
  });

  test("redirects unauthenticated user from settings to login", async ({ page }) => {
    await page.goto("/dashboard/settings");
    
    await page.waitForURL("**/login**", { timeout: 10000 });
    await expect(page).toHaveURL(/login/);
  });

  test("redirects unauthenticated user from upload to login", async ({ page }) => {
    await page.goto("/dashboard/upload");
    
    await page.waitForURL("**/login**", { timeout: 10000 });
    await expect(page).toHaveURL(/login/);
  });

  test("login page is accessible", async ({ page }) => {
    await page.goto("/login");
    
    // Should show login page without redirect
    await expect(page).toHaveURL(/login/);
    
    // Should show some form of sign-in UI
    const signInElement = page.locator('button, input, text=/sign in|log in|continue/i').first();
    await expect(signInElement).toBeVisible({ timeout: 10000 });
  });

  test("health endpoint is publicly accessible", async ({ page }) => {
    const response = await page.goto("/api/health");
    expect(response?.status()).toBe(200);
    
    const body = await response?.json();
    expect(body).toHaveProperty("status");
  });
});
