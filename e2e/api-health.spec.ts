import { test, expect } from "@playwright/test";

test.describe("API Health Check", () => {
  test("health endpoint returns 200", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
  });

  test("tRPC endpoint is accessible", async ({ request }) => {
    // tRPC batch endpoint should return 200 even with empty batch
    const response = await request.get("/api/trpc");
    // Will return 404 or specific error, but server should be up
    expect(response.status()).toBeLessThan(500);
  });
});
