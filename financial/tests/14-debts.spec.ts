import { test, expect } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

const MOCK_DEBT = {
  id: "debt-1",
  name: "Chase Sapphire Card",
  icon: "💳",
  debt_type: "credit_card",
  original_balance: 5000,
  current_balance: 3800,
  interest_rate: 24.99,
  minimum_payment: 95,
  priority_order: 0,
  target_date: null,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  // Computed
  amount_paid: 1200,
  percent_paid: 24,
  monthly_interest: 79.14,
  months_to_payoff: 60.2,
  projected_payoff_date: "2031-07-01",
  total_interest_remaining: 1919,
};

const MOCK_DEBT_HIGH_APR = {
  ...MOCK_DEBT,
  id: "debt-2",
  name: "Store Card",
  icon: "💳",
  interest_rate: 29.99,
  priority_order: 1,
  current_balance: 1200,
  original_balance: 1200,
  amount_paid: 0,
  percent_paid: 0,
};

async function goToDebts(
  page: Parameters<typeof stubDataEndpoints>[0],
  debts: unknown[] = [MOCK_DEBT]
) {
  await stubDataEndpoints(page);
  await page.route("**/api/debts/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ debts }) })
  );
  await page.route("**/api/budget/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summaries: [] }) })
  );
  await page.route("**/api/net-worth**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ net_worth: null }) })
  );
  await page.route("**/api/bills**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bills: [] }) })
  );
  await page.goto("/finances");
  await page.getByRole("button", { name: /manage/i }).click();
  await page.getByTestId("manage-all-btn").click();
  await page.getByRole("button", { name: /debts/i }).click();
}

// ─── Test 1: Empty state ──────────────────────────────────────────────────────

test("debts tab shows empty state with add button", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToDebts(page, []);
  await expect(page.getByText("No debts tracked")).toBeVisible();
  await expect(page.getByTestId("add-first-debt-btn")).toBeVisible();
});

// ─── Test 2: Debt card renders ────────────────────────────────────────────────

test("debt card shows name, APR, and progress", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToDebts(page);
  await expect(page.getByText("Chase Sapphire Card").filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/24.99% APR/i).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/24% paid off/i)).toBeVisible();
});

// ─── Test 3: Wizard opens and creates debt ────────────────────────────────────

test("wizard creates a debt", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  let created = false;
  await stubDataEndpoints(page);
  await page.route("**/api/debts/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ debts: created ? [MOCK_DEBT] : [] }) })
  );
  await page.route("**/api/debts/create**", route => {
    created = true;
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ debt_id: "debt-new-1" }) });
  });
  await page.route("**/api/bills**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bills: [] }) })
  );

  await page.route("**/api/budget/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summaries: [] }) })
  );
  await page.route("**/api/net-worth**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ net_worth: null }) })
  );

  await page.goto("/finances");
  await page.getByRole("button", { name: /manage/i }).click();
  await page.getByTestId("manage-all-btn").click();
  await page.getByRole("button", { name: /debts/i }).click();
  await page.getByTestId("add-first-debt-btn").click();

  // Step 1: name
  await page.getByPlaceholder(/Car loan.*Chase Sapphire/i).fill("My Test Debt");
  await page.getByRole("button", { name: /continue →/i }).click();

  // Step 2: debt type
  await expect(page.getByText("What kind of debt is this?")).toBeVisible();
  await page.getByRole("button", { name: /credit card/i }).click();
  await page.getByRole("button", { name: /continue →/i }).click();

  // Step 3: balance
  await expect(page.getByText("What's the current balance?")).toBeVisible();
  await page.locator('input[placeholder="0.00"]').first().fill("5000");
  await page.getByRole("button", { name: /continue →/i }).click();

  // Step 4: APR
  await expect(page.getByText("What's the interest rate?")).toBeVisible();
  await page.locator('input[placeholder="0.00"]').fill("19.99");
  await page.getByRole("button", { name: /continue →/i }).click();

  // Step 5: term / min payment — skip with Continue
  await page.getByRole("button", { name: /continue →/i }).click();

  // Step 6: link bills — skip
  await page.getByRole("button", { name: /no, skip this/i }).click();

  // Step 7: review → save
  await expect(page.getByText("My Test Debt")).toBeVisible();
  await page.getByTestId("wizard-debt-create-btn").click();

  await expect(page.getByText("Chase Sapphire Card").filter({ visible: true })).toBeVisible();
});

// ─── Test 4: Detail view shows payoff analytics ───────────────────────────────

test("debt detail shows payoff timeline and simulator", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToDebts(page);
  await page.getByTestId("debt-card").click();
  await expect(page.getByTestId("debt-payoff-section")).toBeVisible();
  await expect(page.getByTestId("debt-simulator")).toBeVisible();
  await expect(page.getByText(/At minimum payment/i)).toBeVisible();
});

// ─── Test 5: Extra payment simulator updates output ──────────────────────────

test("extra payment simulator shows savings", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToDebts(page);
  await page.getByTestId("debt-card").click();
  await page.getByTestId("extra-payment-input").fill("200");
  await expect(page.getByText(/interest saved/i)).toBeVisible();
  await expect(page.getByText(/months sooner/i)).toBeVisible();
});

// ─── Test 6: Avalanche warning appears when order is suboptimal ───────────────

test("avalanche warning shows when debts are not optimized", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  // MOCK_DEBT has 24.99% APR at priority_order 0
  // MOCK_DEBT_HIGH_APR has 29.99% APR at priority_order 1
  // Higher APR should be first — so this order is wrong
  await goToDebts(page, [MOCK_DEBT, MOCK_DEBT_HIGH_APR]);
  await expect(page.getByTestId("avalanche-warning")).toBeVisible();
  await expect(page.getByTestId("optimize-order-btn")).toBeVisible();
});
