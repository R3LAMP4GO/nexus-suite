import { test as base, expect } from "@playwright/test";

/**
 * Extended test fixture with helper methods for common actions.
 */
export const test = base.extend<{
  dashboardPage: ReturnType<typeof base.extend>;
}>({});

export { expect };

/**
 * Helper to wait for tRPC queries to settle (loading → loaded).
 * Watches for skeleton/loading indicators to disappear.
 */
export async function waitForPageLoad(page: import("@playwright/test").Page) {
  // Wait for any loading skeletons to disappear
  const skeletons = page.locator(".animate-pulse, [data-loading='true']");
  if (await skeletons.count() > 0) {
    await skeletons.first().waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  }
  // Brief settle time for React hydration
  await page.waitForTimeout(500);
}
