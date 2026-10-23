import { test, expect } from "@playwright/test";

/**
 * Signing in: the journeys only. What the password toggle does to an input's
 * type attribute is not app behaviour, so it is not tested here.
 */

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("wrong details show the error", async ({ page }) => {
    await expect(page.getByText("Sign in to continue")).toBeVisible();

    await page.fill('input[name="email"]', "nobody@example.com");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator("p.text-red-400")).toBeVisible({ timeout: 8000 });
  });

  test("forgot password, there and back", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();

    await expect(page.getByText("Reset your password")).toBeVisible();
    await expect(page.locator('input[name="email"][type="email"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
    await expect(page.locator('input[name="password"]')).not.toBeVisible();

    await page.getByRole("button", { name: "← Back to sign in" }).click();
    await expect(page.getByText("Sign in to continue")).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });
});

test.describe("Reset password page", () => {
  test("a reset link with no code says so", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/invalid|expired|reset link/i)).toBeVisible({ timeout: 8000 });
  });
});
