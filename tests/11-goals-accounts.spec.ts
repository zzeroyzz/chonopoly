import { test, expect } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

const MOCK_GOAL = {
  id: "goal-abc",
  name: "Emergency Fund",
  icon: "🎯",
  goal_type: "savings",
  target_amount: 10000,
  target_date: "2027-01-01",
  created_at: "2026-01-01T00:00:00Z",
  current_balance: 3500,
  percent_complete: 35,
  projected_completion_date: null,
  on_track: false,
  weekly_avg_growth: 0,
  expected_balance: 4000,
  behind_by: 500,
  status: "active",
  last_synced_at: new Date().toISOString(),
};

const MOCK_PLAID_ACCOUNTS = [
  {
    plaid_account_id: "plaid-acc-1",
    plaid_item_id: "item-1",
    account_name: "Chase Checking",
    institution_name: "Chase",
    account_subtype: "checking",
    current_balance: 2450.00,
  },
  {
    plaid_account_id: "plaid-acc-2",
    plaid_item_id: "item-1",
    account_name: "Chase Savings",
    institution_name: "Chase",
    account_subtype: "savings",
    current_balance: 8200.00,
  },
];

// Grouped response shape (Part 1)
const MOCK_ACCOUNTS_GROUPED_ONE_SAVINGS = {
  savings: {
    id: "ga-1",
    plaid_account_id: "plaid-acc-1",
    plaid_item_id: "item-1",
    account_name: "Chase Checking",
    institution_name: "Chase",
    account_subtype: "checking",
    cached_balance: 2450.00,
    account_role: "savings",
  },
  spending: [],
};

const MOCK_ACCOUNTS_GROUPED_SAVINGS_AND_SPENDING = {
  savings: {
    id: "ga-1",
    plaid_account_id: "plaid-acc-1",
    plaid_item_id: "item-1",
    account_name: "Chase Checking",
    institution_name: "Chase",
    account_subtype: "checking",
    cached_balance: 2450.00,
    account_role: "savings",
  },
  spending: [
    {
      id: "ga-2",
      plaid_account_id: "plaid-acc-2",
      plaid_item_id: "item-1",
      account_name: "Chase Savings",
      institution_name: "Chase",
      account_subtype: "savings",
      cached_balance: 8200.00,
      account_role: "spending",
    },
  ],
};

const MOCK_ACCOUNTS_ONE_SPENDING_ONLY = {
  savings: null,
  spending: [
    {
      id: "ga-2",
      plaid_account_id: "plaid-acc-2",
      plaid_item_id: "item-1",
      account_name: "Chase Savings",
      institution_name: "Chase",
      account_subtype: "savings",
      cached_balance: 8200.00,
      account_role: "spending",
    },
  ],
};

async function goToGoals(page: Parameters<typeof stubDataEndpoints>[0]) {
  await stubDataEndpoints(page);
  await page.route("**/api/goals/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [MOCK_GOAL] }) })
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
  await page.getByRole("button", { name: /goals/i }).click();
  await expect(page.getByText("Emergency Fund").filter({ visible: true })).toBeVisible();
}

// ─── Test 1: wizard opens and shows step 1 ────────────────────────────────────

test("add goal opens wizard at step 1", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToGoals(page);

  await page.getByRole("button", { name: /add goal/i }).first().click();
  await expect(page.getByTestId("goal-wizard")).toBeVisible();
  await expect(page.getByText("New savings goal")).toBeVisible();
  await expect(page.getByTestId("wizard-progress")).toBeVisible();
  await expect(page.getByPlaceholder(/emergency fund/i)).toBeVisible();
});

// ─── Test 2: wizard advances through steps ────────────────────────────────────

test("wizard step 1 Next button is disabled until name has 2+ chars", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToGoals(page);
  await page.getByRole("button", { name: /add goal/i }).first().click();
  await expect(page.getByTestId("goal-wizard")).toBeVisible();

  const nextBtn = page.getByRole("button", { name: /next/i });
  await expect(nextBtn).toBeDisabled();

  await page.getByPlaceholder(/emergency fund/i).fill("AB");
  await expect(nextBtn).toBeEnabled();
});

// ─── Test 3: wizard POSTs savings_account and spending_accounts ────────────────

test("wizard goal creation POSTs savings_account and spending_accounts", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToGoals(page);
  await page.route("**/api/plaid/accounts**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accounts: MOCK_PLAID_ACCOUNTS }) })
  );

  let postedBody: Record<string, unknown> | null = null;
  await page.route("**/api/goals/create**", async route => {
    postedBody = await route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, goal_id: "new-goal-1" }) });
  });
  await page.route("**/api/goals/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [MOCK_GOAL] }) })
  );

  // Step 1: name
  await page.getByRole("button", { name: /add goal/i }).first().click();
  await page.getByPlaceholder(/emergency fund/i).fill("Vacation Fund");
  await page.getByRole("button", { name: /next/i }).click();

  // Step 2: skip targets
  await page.getByRole("button", { name: /skip for now/i }).click();

  // Step 3: savings account — Chase Savings (savings subtype, non-credit)
  await expect(page.getByText("Chase Savings")).toBeVisible();
  await page.getByText("Chase Savings").click();
  await page.getByRole("button", { name: /next/i }).click();

  // Step 4: spending pre-selected, advance
  await page.getByRole("button", { name: /review/i }).click();

  // Step 5: create
  await page.getByTestId("wizard-create-btn").click();

  expect(postedBody).not.toBeNull();
  expect(postedBody!.name).toBe("Vacation Fund");
  const sa = postedBody!.savings_account as { plaid_account_id: string };
  expect(sa.plaid_account_id).toBe("plaid-acc-2");
  const spending = postedBody!.spending_accounts as { plaid_account_id: string }[];
  expect(Array.isArray(spending)).toBe(true);
  expect(spending.some(a => a.plaid_account_id === "plaid-acc-1")).toBe(true);
});

// ─── Test 4: detail view shows linked accounts section with savings + spending ─

test("detail view shows savings and spending sub-sections", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToGoals(page);
  await page.route("**/api/goals/history**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ history: [] }) })
  );
  await page.route("**/api/goals/accounts**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_ACCOUNTS_GROUPED_SAVINGS_AND_SPENDING) })
  );

  await page.getByText("Emergency Fund").filter({ visible: true }).click();
  await expect(page.getByTestId("linked-accounts-section")).toBeVisible();
  await expect(page.getByText("Linked accounts")).toBeVisible();
  await expect(page.getByTestId("savings-account-row")).toBeVisible();
  await expect(page.getByTestId("spending-accounts-list")).toBeVisible();
  await expect(page.getByText("Chase Checking")).toBeVisible();
  await expect(page.getByText("Chase Savings")).toBeVisible();
  await expect(page.getByText("$2,450.00")).toBeVisible();
});

// ─── Test 5: remove button disabled for last spending; savings always removable ─

test("spending remove disabled at 1; savings remove always enabled", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToGoals(page);
  await page.route("**/api/goals/history**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ history: [] }) })
  );
  // One spending account only (no savings)
  await page.route("**/api/goals/accounts**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_ACCOUNTS_ONE_SPENDING_ONLY) })
  );

  await page.getByText("Emergency Fund").filter({ visible: true }).click();
  await expect(page.getByTestId("linked-accounts-section")).toBeVisible();

  // Last spending account's remove button should be disabled
  const spendingRemoveBtn = page.getByTestId("remove-account-ga-2");
  await expect(spendingRemoveBtn).toBeDisabled();
});

test("savings account remove button is never disabled", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToGoals(page);
  await page.route("**/api/goals/history**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ history: [] }) })
  );
  // One savings account, no spending
  await page.route("**/api/goals/accounts**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_ACCOUNTS_GROUPED_ONE_SAVINGS) })
  );

  await page.getByText("Emergency Fund").filter({ visible: true }).click();
  await expect(page.getByTestId("savings-account-row")).toBeVisible();

  const savingsRemoveBtn = page.getByTestId("remove-account-ga-1");
  await expect(savingsRemoveBtn).not.toBeDisabled();
});

// ─── Test 6 (was Test 6): "Add account" opens picker with role toggle + confirm ─

test("Add account button opens picker with role toggle and confirm in detail view", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToGoals(page);
  await page.route("**/api/goals/history**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ history: [] }) })
  );
  await page.route("**/api/goals/accounts**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_ACCOUNTS_GROUPED_ONE_SAVINGS) })
  );
  await page.route("**/api/plaid/accounts**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accounts: MOCK_PLAID_ACCOUNTS }),
    })
  );

  await page.getByText("Emergency Fund").filter({ visible: true }).click();
  await expect(page.getByTestId("add-account-btn")).toBeVisible();
  await page.getByTestId("add-account-btn").click();

  await expect(page.getByTestId("detail-account-picker")).toBeVisible();
  // Role toggle buttons should be visible (exact match to avoid matching account rows)
  await expect(page.getByTestId("detail-account-picker").getByRole("button", { name: "savings", exact: true })).toBeVisible();
  await expect(page.getByTestId("detail-account-picker").getByRole("button", { name: "spending", exact: true })).toBeVisible();

  // Default role is spending — plaid-acc-1 is already linked (savings), so only plaid-acc-2 shows
  await expect(page.getByTestId("detail-account-picker").getByText("Chase Savings")).toBeVisible();
  await expect(page.getByTestId("confirm-add-accounts-btn")).toBeDisabled();

  await page.getByTestId("detail-account-picker").getByText("Chase Savings").click();
  await expect(page.getByTestId("confirm-add-accounts-btn")).toBeEnabled();
  await expect(page.getByTestId("confirm-add-accounts-btn")).toContainText("Link 1 account");
});
