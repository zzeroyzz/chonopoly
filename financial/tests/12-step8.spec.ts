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

const MOCK_TEAM = { id: "team-ctx-1", name: "The Hernandez Family" };

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

async function goToEmptyGoals(page: Parameters<typeof stubDataEndpoints>[0]) {
  await stubDataEndpoints(page);
  await page.route("**/api/goals/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [] }) })
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
  await expect(page.getByText("No savings goals yet")).toBeVisible();
}

// ─── Test 1: Personal context shown by default ────────────────────────────────

test("sidebar shows Personal context button by default", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await stubDataEndpoints(page);
  await page.route("**/api/goals/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [] }) })
  );
  await page.goto("/finances");

  await expect(page.getByTestId("context-personal")).toBeVisible();
  await expect(page.getByTestId("context-personal")).toContainText("Personal");
  // Team banner should not be present for personal context
  await expect(page.getByTestId("context-banner")).not.toBeVisible();
});

// ─── Test 2: Teams fetched from /api/teams/mine appear in sidebar ─────────────

test("teams from /api/teams/mine appear as context options in sidebar", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await stubDataEndpoints(page);
  // LIFO: this route wins over stubDataEndpoints' empty-teams stub
  await page.route("**/api/teams/mine**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ teams: [MOCK_TEAM] }) })
  );
  await page.route("**/api/goals/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [] }) })
  );
  await page.goto("/finances");

  await expect(page.getByTestId(`context-team-${MOCK_TEAM.id}`)).toBeVisible();
  await expect(page.getByTestId(`context-team-${MOCK_TEAM.id}`)).toContainText(MOCK_TEAM.name);
});

// ─── Test 3: Clicking team activates team context ─────────────────────────────

test("clicking a team context option activates it and shows banner", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await stubDataEndpoints(page);
  await page.route("**/api/teams/mine**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ teams: [MOCK_TEAM] }) })
  );
  await page.route("**/api/goals/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [] }) })
  );
  await page.goto("/finances");
  await page.getByRole("button", { name: /manage/i }).click();
  await page.getByTestId("manage-all-btn").click();
  await page.getByRole("button", { name: /goals/i }).click();
  await expect(page.getByText("No savings goals yet")).toBeVisible();

  await page.getByTestId(`context-team-${MOCK_TEAM.id}`).click();

  await expect(page.getByTestId("context-banner")).toBeVisible();
});

// ─── Test 4: Goals API called with context params ─────────────────────────────

test("goals summary API is called with context_type and context_id params", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await stubDataEndpoints(page);
  await page.route("**/api/teams/mine**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ teams: [MOCK_TEAM] }) })
  );

  const capturedUrls: string[] = [];
  await page.route("**/api/goals/summary**", route => {
    capturedUrls.push(route.request().url());
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [] }) });
  });

  await page.goto("/finances");
  await page.getByRole("button", { name: /manage/i }).click();
  await page.getByTestId("manage-all-btn").click();
  await page.getByRole("button", { name: /goals/i }).click();
  await expect(page.getByText("No savings goals yet")).toBeVisible();

  // Initial load should include personal context
  expect(capturedUrls.some(u => u.includes("context_type=personal"))).toBe(true);

  // Switch to team — goals should reload with team context
  await page.getByTestId(`context-team-${MOCK_TEAM.id}`).click();
  await page.waitForFunction(() => true); // allow re-render

  expect(capturedUrls.some(u => u.includes("context_type=team") && u.includes(`context_id=${MOCK_TEAM.id}`))).toBe(true);
});

// ─── Test 5: Reset button returns to personal context ────────────────────────

test("context-reset button returns from team to personal context", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await stubDataEndpoints(page);
  await page.route("**/api/teams/mine**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ teams: [MOCK_TEAM] }) })
  );
  await page.route("**/api/goals/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [] }) })
  );
  await page.goto("/finances");

  // Switch to team
  await page.getByTestId(`context-team-${MOCK_TEAM.id}`).click();
  await expect(page.getByTestId("context-banner")).toBeVisible();

  // Reset to personal
  await page.getByTestId("context-reset").click();
  await expect(page.getByTestId("context-banner")).not.toBeVisible();
  await expect(page.getByTestId("context-personal")).toBeVisible();
});

// ─── Test 6: 403 from goals API resets context to personal ───────────────────

test("goals API 403 silently resets active context to personal", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await stubDataEndpoints(page);
  await page.route("**/api/teams/mine**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ teams: [MOCK_TEAM] }) })
  );

  // Personal context always succeeds; team context returns 403
  await page.route("**/api/goals/summary**", route => {
    const url = route.request().url();
    if (url.includes("context_type=team")) {
      route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Forbidden" }) });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [] }) });
    }
  });

  await page.goto("/finances");
  await page.getByRole("button", { name: /manage/i }).click();
  await page.getByTestId("manage-all-btn").click();
  await page.getByRole("button", { name: /goals/i }).click();
  await expect(page.getByText("No savings goals yet")).toBeVisible();

  // Switch to team — triggers 403 → resets to personal
  await page.getByTestId(`context-team-${MOCK_TEAM.id}`).click();

  // Context banner should not remain (reset happened)
  await expect(page.getByTestId("context-banner")).not.toBeVisible();
});

// ─── Test 7: wizard opens from empty state CTA ────────────────────────────────

test("wizard opens from 'Create your first goal' and shows progress indicator", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToEmptyGoals(page);

  await page.getByRole("button", { name: /create your first goal/i }).click();
  await expect(page.getByTestId("goal-wizard")).toBeVisible();
  await expect(page.getByText("New savings goal")).toBeVisible();
  await expect(page.getByTestId("wizard-progress")).toBeVisible();

  // Step 1 content is visible
  await expect(page.getByPlaceholder(/emergency fund/i)).toBeVisible();
});

// ─── Test 8: wizard advances through all 5 steps ─────────────────────────────

test("wizard advances through all 5 steps and completes goal creation", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToGoals(page);
  await page.route("**/api/plaid/accounts**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accounts: MOCK_PLAID_ACCOUNTS }) })
  );
  await page.route("**/api/goals/create**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, goal_id: "new-goal-99" }) });
  });
  await page.route("**/api/goals/summary**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ goals: [MOCK_GOAL] }) })
  );

  // Open wizard
  await page.getByRole("button", { name: /add goal/i }).first().click();
  await expect(page.getByTestId("goal-wizard")).toBeVisible();

  // Step 1 — name
  await page.getByPlaceholder(/emergency fund/i).fill("Europe Trip");
  await page.getByRole("button", { name: /next/i }).click();

  // Step 2 — targets, enter amount and skip
  await expect(page.getByText("What's your target?")).toBeVisible();
  await page.getByRole("button", { name: /skip for now/i }).click();

  // Step 3 — savings account
  await expect(page.getByText("Where are you saving to?")).toBeVisible();
  await expect(page.getByText("Chase Checking")).toBeVisible();
  await page.getByText("Chase Checking").click();
  await page.getByRole("button", { name: /next/i }).click();

  // Step 4 — spending accounts pre-selected
  await expect(page.getByText("Which accounts track spending?")).toBeVisible();
  await expect(page.getByText("Chase Savings")).toBeVisible();
  await page.getByRole("button", { name: /review/i }).click();

  // Step 5 — review
  await expect(page.getByText("Looks good?")).toBeVisible();
  await expect(page.getByText("Europe Trip")).toBeVisible();
  await expect(page.getByText("Savings account")).toBeVisible();

  // Create (advances to step 6 — add budgets)
  await page.getByTestId("wizard-create-btn").click();
  // Step 6 — skip budgets to finish
  await expect(page.getByTestId("wizard-finish-btn")).toBeVisible();
  await page.getByTestId("wizard-finish-btn").click();
  await expect(page.getByTestId("goal-wizard")).not.toBeVisible();
});

// ─── Test 9: back button reverses direction ───────────────────────────────────

test("wizard back button returns to previous step", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToGoals(page);
  await page.route("**/api/plaid/accounts**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accounts: MOCK_PLAID_ACCOUNTS }) })
  );

  await page.getByRole("button", { name: /add goal/i }).first().click();

  // Advance to step 2
  await page.getByPlaceholder(/emergency fund/i).fill("Test Goal");
  await page.getByRole("button", { name: /next/i }).click();
  await expect(page.getByText("What's your target?")).toBeVisible();

  // Go back to step 1 — scope to wizard to avoid matching ManagePanel's Back button
  await page.getByTestId("goal-wizard").getByRole("button", { name: /back/i }).click();
  await expect(page.getByPlaceholder(/emergency fund/i)).toBeVisible();
  await expect(page.locator("input[placeholder*='Emergency fund']")).toHaveValue("Test Goal");
});

// ─── Test 10: discard confirmation appears when X clicked with a name entered ──

test("wizard shows discard confirmation when closed with unsaved name", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToGoals(page);

  await page.getByRole("button", { name: /add goal/i }).first().click();
  await expect(page.getByTestId("goal-wizard")).toBeVisible();

  // Type a name, then try to close
  await page.getByPlaceholder(/emergency fund/i).fill("My Goal");
  await page.getByTestId("wizard-close-btn").click();

  // Discard confirmation should appear
  await expect(page.getByText("Discard this goal?")).toBeVisible();
  await expect(page.getByText("Your progress won't be saved.")).toBeVisible();

  // "Keep editing" should dismiss and return to wizard
  await page.getByRole("button", { name: /keep editing/i }).click();
  await expect(page.getByText("Discard this goal?")).not.toBeVisible();
  await expect(page.getByTestId("goal-wizard")).toBeVisible();

  // "Discard" should close the wizard
  await page.getByTestId("wizard-close-btn").click();
  await page.getByTestId("discard-confirm-btn").click();
  await expect(page.getByTestId("goal-wizard")).not.toBeVisible();
});
