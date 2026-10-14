import { test, expect } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

const MOCK_TRANSACTIONS = [
  {
    transaction_id: "tx1",
    name: "Trader Joe's",
    merchant_name: "Trader Joe's",
    amount: 63.47,
    date: "2026-05-20",
    personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "GROCERIES" },
    logo_url: null,
  },
  {
    transaction_id: "tx2",
    name: "Shell",
    merchant_name: "Shell",
    amount: 45.00,
    date: "2026-05-18",
    personal_finance_category: { primary: "TRANSPORTATION", detailed: "GAS_STATIONS" },
    logo_url: null,
  },
  {
    transaction_id: "tx3",
    name: "Netflix",
    merchant_name: "Netflix",
    amount: 15.49,
    date: "2026-05-15",
    personal_finance_category: { primary: "ENTERTAINMENT", detailed: "STREAMING" },
    logo_url: null,
  },
];

const MOCK_ACCOUNTS = [
  {
    account_id: "acc1",
    name: "Checking",
    type: "depository",
    subtype: "checking",
    balances: { current: 2450.00, available: 2300.00 },
    institution_name: "Chase",
  },
];

test.describe("Budget page — no bank connected", () => {
  test.beforeEach(async ({ page }) => {
    if (!process.env.TEST_EMAIL) test.skip();
    await stubDataEndpoints(page);
    await page.route("**/api/plaid/transactions**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accounts: [], transactions: [] }) })
    );
    await page.route("**/rest/v1/plaid_items**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
    await page.goto("/finances");
  });

  test("shows empty state with connect button", async ({ page }) => {
    await expect(page.getByText("No banks connected")).toBeVisible();
    await expect(page.getByRole("button", { name: /connect bank/i })).toHaveCount(2);
  });

  // RETIRED — owner decision 2026-07-09: /finances is the app's root route (/ redirects to
  // /finances), so there is no "up." The back arrow (<Link href="/course">) was removed from
  // BudgetClient to avoid misrepresenting the routing structure. This test correctly caught
  // an unreviewed routing change before retirement.
  test.skip("back arrow navigates to home", async () => {});
});

test.describe("Budget page — bank connected", () => {
  test.beforeEach(async ({ page }) => {
    if (!process.env.TEST_EMAIL) test.skip();
    await stubDataEndpoints(page);
    await page.route("**/rest/v1/plaid_items**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "id1", access_token: "tok", item_id: "item1", institution_name: "Chase" }]),
      })
    );
    await page.route("**/api/plaid/transactions**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accounts: MOCK_ACCOUNTS, transactions: MOCK_TRANSACTIONS }),
      })
    );
    await page.goto("/finances");
  });

  test("shows account balance", async ({ page }) => {
    await expect(page.getByText("Checking").first()).toBeVisible();
    await expect(page.getByText("$2,450.00").first()).toBeVisible();
  });

  test("shows spending breakdown categories", async ({ page }) => {
    await page.getByRole("button", { name: /transactions/i }).click();
    await expect(page.getByRole("button", { name: "Food & Drink", exact: true })).toBeVisible();
    await expect(page.getByText("Transportation", { exact: true })).toBeVisible();
    await expect(page.getByText("Entertainment", { exact: true })).toBeVisible();
  });

  test("shows transaction list with merchants", async ({ page }) => {
    await page.getByRole("button", { name: /transactions/i }).click();
    await expect(page.getByText("Trader Joe's")).toBeVisible();
    await expect(page.getByText("Shell")).toBeVisible();
    await expect(page.getByText("Netflix")).toBeVisible();
  });

  test("transaction amounts are formatted correctly", async ({ page }) => {
    await page.getByRole("button", { name: /transactions/i }).click();
    await expect(page.getByText("-$63.47")).toBeVisible();
    await expect(page.getByText("-$45.00")).toBeVisible();
    await expect(page.getByText("-$15.49")).toBeVisible();
  });
});

test.describe("Budget link in profile dropdown", () => {
  test.beforeEach(async ({ page }) => {
    if (!process.env.TEST_EMAIL) test.skip();
    await stubDataEndpoints(page);
    await page.goto("/course");
  });

  test("Budget link appears in profile dropdown", async ({ page }) => {
    await page.getByRole("button", { name: /profile menu/i }).click();
    await expect(page.getByRole("link", { name: /finances/i })).toBeVisible();
  });

  test("Budget link navigates to /finances", async ({ page }) => {
    await page.route("**/rest/v1/plaid_items**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
    await page.route("**/api/plaid/transactions**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accounts: [], transactions: [] }) })
    );
    await page.getByRole("button", { name: /profile menu/i }).click();
    await page.getByRole("link", { name: /finances/i }).click();
    await expect(page).toHaveURL("http://localhost:3000/finances");
  });
});
