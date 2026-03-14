import { test as setup, expect } from "@playwright/test";

/**
 * Authenticate via the dev credentials provider.
 * NODE_ENV must be "development" for this to work.
 * Saves session state to e2e/.auth/user.json for reuse.
 */
setup("authenticate", async ({ page }) => {
  // Navigate to login
  await page.goto("/login");

  // Dev mode shows a credentials form — fill email and submit
  // The dev credentials provider auto-creates user + org with MULTIPLIER tier
  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 15000 });
  await emailInput.fill("e2e-test@nexus-suite.com");

  // Find and click the sign-in button
  const signInButton = page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Login"), button:has-text("Continue")').first();
  await signInButton.click();

  // Wait for redirect to dashboard (dev login creates ACTIVE org, skips onboarding)
  await page.waitForURL("**/dashboard**", { timeout: 15000 });

  // Verify we're on the dashboard
  await expect(page).toHaveURL(/dashboard/);

  // Save auth state
  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
