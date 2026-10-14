import { test, expect } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

// ─── Mock data ────────────────────────────────────────────────────────────────

const TODAY = new Date();

// Budget due in 5 days, 40% used — on-track
const MOCK_BUDGET_ONTRACK = {
  budget_id: "bud-1",
  goal_id: "goal-1",
  name: "Groceries",
  category_name: "Food & Drink",
  category_color: "#34d399",
  category_icon: "UtensilsCrossed",
  total_limit: 500,
  effective_limit: 500,
  amount_spent: 200,
  amount_remaining: 300,
  percent_used: 40,
  over_budget: false,
  period_type: "monthly",
  period_start: `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}-01`,
  period_end: `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}-30`,
  days_remaining: 20,
  daily_rate: 15,
  transaction_count: 4,
  notified_80: false,
  notified_over: false,
  nudge_sent: false,
  status: "active",
};

// Budget 95% used — warning
const MOCK_BUDGET_WARNING = {
  ...MOCK_BUDGET_ONTRACK,
  budget_id: "bud-2",
  name: "Transport",
  category_name: "Transportation",
  category_icon: "Car",
  amount_spent: 475,
  amount_remaining: 25,
  percent_used: 95,
  over_budget: false,
};

// Bill due this week (unpaid)
const thisWeekDay = new Date(TODAY);
thisWeekDay.setUTCDate(TODAY.getUTCDate() - TODAY.getUTCDay() + 3); // Wednesday of this week
const MOCK_BILL_THIS_WEEK = {
  id: "bill-1",
  name: "Netflix",
  amount: 15.99,
  due_day: thisWeekDay.getUTCDate(),
  recurrence: "monthly",
  category_id: "ENTERTAINMENT",
  is_auto_detected: false,
  plaid_merchant: null,
  is_active: true,
  last_paid_at: null,
  notified_3day: false,
  notified_today: false,
  next_due_date: thisWeekDay.toISOString().split("T")[0],
  bill_payments: [],
};

const MOCK_GOAL = {
  id: "goal-1",
  name: "Emergency Fund",
  icon: "🏦",
  goal_type: "savings",
  target_amount: 10000,
  target_date: "2027-01-01",
  created_at: "2026-01-01T00:00:00Z",
  current_balance: 3500,
  percent_complete: 35,
  projected_completion_date: null,
  on_track: true,
  weekly_avg_growth: 200,
  expected_balance: 3500,
  behind_by: 0,
  status: "active",
  last_synced_at: null,
};

// ─── Setup helper ─────────────────────────────────────────────────────────────

async function stubStatusPage(
  page: import("@playwright/test").Page,
  opts: {
    budgets?: typeof MOCK_BUDGET_ONTRACK[];
    bills?: typeof MOCK_BILL_THIS_WEEK[];
    goals?: typeof MOCK_GOAL[];
  } = {}
) {
  await stubDataEndpoints(page);
  await page.route("**/rest/v1/plaid_items**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/plaid/transactions**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accounts: [], transactions: [] }) })
  );
  await page.route("**/api/budget/summary**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summaries: opts.budgets ?? [MOCK_BUDGET_ONTRACK], totals: null }),
    })
  );
  await page.route("**/api/bills**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ bills: opts.bills ?? [MOCK_BILL_THIS_WEEK] }),
    })
  );
  await page.route("**/api/goals/summary**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ goals: opts.goals ?? [MOCK_GOAL] }),
    })
  );
  await page.route("**/api/net-worth**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ net_worth: 42000 }),
    })
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Manage tab — StatusPage", () => {
  test.beforeEach(async ({ page }) => {
    if (!process.env.TEST_EMAIL) test.skip();
  });

  test("Manage tab lands on StatusPage by default", async ({ page }) => {
    await stubStatusPage(page);
    await page.goto("/finances?tab=manage");

    await expect(page.getByTestId("status-page")).toBeVisible();
    await expect(page.getByTestId("verdict-banner")).toBeVisible();
  });

  test("budget rows render with correct data", async ({ page }) => {
    await stubStatusPage(page, { budgets: [MOCK_BUDGET_ONTRACK, MOCK_BUDGET_WARNING] });
    await page.goto("/finances?tab=manage");

    await expect(page.getByTestId("status-budget-row-bud-1")).toBeVisible();
    await expect(page.getByTestId("status-budget-row-bud-2")).toBeVisible();
    // Warning row should appear first (sorted by status)
    const rows = page.locator('[data-testid^="status-budget-row-"]');
    await expect(rows.first()).toHaveAttribute("data-testid", "status-budget-row-bud-2");
  });

  test("verdict banner shows ok when no issues", async ({ page }) => {
    // amount_spent 0 so spend fraction (0%) never exceeds elapsed fraction at any point in the month
    await stubStatusPage(page, { budgets: [{ ...MOCK_BUDGET_ONTRACK, amount_spent: 0, amount_remaining: 500, percent_used: 0 }], bills: [] });
    await page.goto("/finances?tab=manage");

    await expect(page.getByTestId("verdict-banner")).toContainText("On track");
  });

  test("bills-week-row shows unpaid count for current week", async ({ page }) => {
    await stubStatusPage(page, { bills: [MOCK_BILL_THIS_WEEK] });
    await page.goto("/finances?tab=manage");

    const billsRow = page.getByTestId("bills-week-row");
    await expect(billsRow).toBeVisible();
    await expect(billsRow).toContainText("1 unpaid bill");
  });

  test("'Manage all' bottom row navigates to ManagePanel", async ({ page }) => {
    await stubStatusPage(page);
    await page.goto("/finances?tab=manage");

    await page.getByTestId("manage-all-btn").click();
    // ManagePanel is visible, StatusPage is not
    await expect(page.getByTestId("status-page")).not.toBeVisible();
  });

  test("back from ManagePanel returns to StatusPage", async ({ page }) => {
    await stubStatusPage(page);
    await page.goto("/finances?tab=manage");

    await page.getByTestId("manage-all-btn").click();
    await expect(page.getByTestId("status-page")).not.toBeVisible();

    await page.getByRole("button", { name: /^Back$/i }).first().click();
    await expect(page.getByTestId("status-page")).toBeVisible();
  });

  test("clicking a budget row opens drilldown", async ({ page }) => {
    await stubStatusPage(page);
    await page.route("**/api/budget/transactions**", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transactions: [] }) })
    );
    await page.route("**/api/budget/history**", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ history: [] }) })
    );
    await page.route("**/api/budget/snapshots**", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ snapshots: [] }) })
    );
    await page.goto("/finances?tab=manage");

    await page.getByTestId("status-budget-row-bud-1").click();
    await expect(page.getByTestId("status-page")).not.toBeVisible();
  });

  test("back from drilldown returns to StatusPage", async ({ page }) => {
    await stubStatusPage(page);
    await page.route("**/api/budget/transactions**", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transactions: [] }) })
    );
    await page.route("**/api/budget/history**", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ history: [] }) })
    );
    await page.route("**/api/budget/snapshots**", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ snapshots: [] }) })
    );
    await page.goto("/finances?tab=manage");

    await page.getByTestId("status-budget-row-bud-1").click();
    await page.getByRole("button", { name: /^Back$/i }).first().click();
    await expect(page.getByTestId("status-page")).toBeVisible();
  });

  test("'View all goals' opens goals sub-view with back affordance", async ({ page }) => {
    await stubStatusPage(page, { goals: [MOCK_GOAL] });
    await page.route("**/api/goals**", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [MOCK_GOAL] }) })
    );
    await page.goto("/finances?tab=manage");

    await page.getByTestId("view-all-goals-btn").click();
    await expect(page.getByTestId("status-page")).not.toBeVisible();
    // Back button is present
    await expect(page.getByRole("button", { name: /^Back$/i }).first()).toBeVisible();
  });

  test("back from goals sub-view returns to StatusPage", async ({ page }) => {
    await stubStatusPage(page, { goals: [MOCK_GOAL] });
    await page.route("**/api/goals**", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [MOCK_GOAL] }) })
    );
    await page.goto("/finances?tab=manage");

    await page.getByTestId("view-all-goals-btn").click();
    await page.getByRole("button", { name: /^Back$/i }).first().click();
    await expect(page.getByTestId("status-page")).toBeVisible();
  });

  test("bills row opens bills sub-view with back affordance", async ({ page }) => {
    await stubStatusPage(page);
    await page.goto("/finances?tab=manage");

    await page.getByTestId("bills-week-row").click();
    await expect(page.getByTestId("status-page")).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^Back$/i }).first()).toBeVisible();
  });

  test("back from bills sub-view returns to StatusPage", async ({ page }) => {
    await stubStatusPage(page);
    await page.goto("/finances?tab=manage");

    await page.getByTestId("bills-week-row").click();
    await page.getByRole("button", { name: /^Back$/i }).first().click();
    await expect(page.getByTestId("status-page")).toBeVisible();
  });

  test("empty state shows CTA when no budgets", async ({ page }) => {
    await stubStatusPage(page, { budgets: [] });
    await page.goto("/finances?tab=manage");

    await expect(page.getByTestId("status-page")).toBeVisible();
    await expect(page.getByText("No budgets yet")).toBeVisible();
    await expect(page.getByText("Create first budget")).toBeVisible();
  });

  test("navigating away and back resets to StatusPage", async ({ page }) => {
    await stubStatusPage(page);
    await page.goto("/finances?tab=manage");

    // Go to Manage all
    await page.getByTestId("manage-all-btn").click();
    await expect(page.getByTestId("status-page")).not.toBeVisible();

    // Navigate away
    await page.getByRole("button", { name: "Overview" }).first().click();
    // Come back
    await page.getByRole("button", { name: "Manage" }).first().click();

    // Should be back on StatusPage
    await expect(page.getByTestId("status-page")).toBeVisible();
  });
});
