import { test as setup, expect } from "@playwright/test";

/**
 * Authenticate via the NextAuth credentials provider.
 * In development mode, a "Dev Login" button exists on the login page
 * that auto-creates a user + org with MULTIPLIER tier.
 *
 * If the dev button isn't available, we use the NextAuth default
 * sign-in page at /api/auth/signin/credentials.
 */
setup("authenticate", async ({ page }) => {
  // Strategy 1: Try the NextAuth built-in sign-in page for credentials
  // This is the most reliable approach as it handles CSRF internally
  await page.goto("/api/auth/signin/credentials");
  await page.waitForLoadState("domcontentloaded");

  // Check if we got redirected or the page has a form
  const url = page.url();

  if (url.includes("/api/auth/signin") || url.includes("/signin")) {
    // NextAuth default sign-in page — fill the email field
    const emailInput = page.locator('input[name="email"]').first();
    await emailInput.waitFor({ state: "visible", timeout: 10000 });
    await emailInput.fill("e2e-test@nexus-suite.com");

    // Submit the form
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Wait for redirect
    await page.waitForURL((url) => !url.toString().includes("/api/auth/signin"), {
      timeout: 15000,
    });
  } else if (url.includes("/login")) {
    // Custom login page — look for dev login button first
    const devLoginBtn = page.locator('button:has-text("Dev Login")').first();

    if (await devLoginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await devLoginBtn.click();
      await page.waitForURL("**/dashboard**", { timeout: 15000 });
    } else {
      // No dev button — use email form (will trigger Resend magic link)
      const emailInput = page.locator('input[type="email"]').first();
      await emailInput.fill("e2e-test@nexus-suite.com");
      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.click();
      await page.waitForTimeout(3000);
    }
  }

  // Verify we're authenticated by checking we can access dashboard
  await page.goto("/dashboard");
  await page.waitForLoadState("domcontentloaded");

  // If still on login, auth failed — but we should still save state for tests to detect
  const finalUrl = page.url();
  if (finalUrl.includes("/dashboard")) {
    console.log("[e2e-auth] ✅ Authenticated successfully — on dashboard");
  } else {
    console.log(`[e2e-auth] ⚠ Auth may have failed — ended up on: ${finalUrl}`);
  }

  // Save auth state
  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
