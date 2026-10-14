import { test, expect } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

// ─── Mock data ────────────────────────────────────────────────────────────────

const TODAY = new Date();
const in3Days = new Date(TODAY);
in3Days.setDate(TODAY.getDate() + 3);
const in3DaysStr = in3Days.toISOString().split("T")[0];

const in15Days = new Date(TODAY);
in15Days.setDate(TODAY.getDate() + 15);
const in15DaysStr = in15Days.toISOString().split("T")[0];

const MOCK_BILL_DUE_SOON = {
  id: "bill-1",
  name: "Netflix",
  amount: 22.99,
  due_day: in3Days.getDate(),
  recurrence: "monthly",
  category_id: "ENTERTAINMENT",
  is_auto_detected: false,
  plaid_merchant: null,
  is_active: true,
  last_paid_at: null,
  notified_3day: false,
  notified_today: false,
  next_due_date: in3DaysStr,
  bill_payments: [],
};

const MOCK_BILL_WITH_HISTORY = {
  id: "bill-2",
  name: "Electricity",
  amount: 140.0,
  due_day: in15Days.getDate(),
  recurrence: "monthly",
  category_id: null,
  is_auto_detected: false,
  plaid_merchant: null,
  is_active: true,
  last_paid_at: null,
  notified_3day: false,
  notified_today: false,
  next_due_date: in15DaysStr,
  bill_payments: [
    { id: "pay-1", paid_at: "2026-05-15T10:00:00Z", amount: 140.0, period: "2026-05" },
    { id: "pay-2", paid_at: "2026-04-14T10:00:00Z", amount: 132.5,  period: "2026-04" },
  ],
};

const MOCK_BILLS_RESPONSE = { bills: [MOCK_BILL_DUE_SOON, MOCK_BILL_WITH_HISTORY] };
const EMPTY_BILLS_RESPONSE = { bills: [] };

// ─── Helper ───────────────────────────────────────────────────────────────────

async function goToBills(
  page: Parameters<typeof stubDataEndpoints>[0],
  bills = MOCK_BILLS_RESPONSE
) {
  await stubDataEndpoints(page);
  await page.route("**/api/bills**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bills) })
  );
  await page.route("**/api/plaid/transactions**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transactions: [], accounts: [] }) })
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
  await page.getByRole("button", { name: /bills/i }).click();
}

// ─── Test 1: Summary bar ──────────────────────────────────────────────────────

test("bills summary bar shows totals", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToBills(page);

  // Summary stat cards are visible
  await expect(page.getByText("Due This Month", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Overdue").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Paid this cycle")).toBeVisible();
  await expect(page.getByText("Next bill").filter({ visible: true })).toBeVisible();
});

// ─── Test 2: Bill names render in grid ───────────────────────────────────────

test("bills grid shows bill names and amounts", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToBills(page);

  await expect(page.getByText("Netflix").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Electricity").filter({ visible: true }).first()).toBeVisible();
  // Amount shown
  await expect(page.getByText(/22\.99/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/140\.00/).filter({ visible: true }).first()).toBeVisible();
});

// ─── Test 3: Empty state ──────────────────────────────────────────────────────

test("bills panel shows empty state when no bills", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToBills(page, EMPTY_BILLS_RESPONSE);
  await expect(page.getByText(/no bills yet/i)).toBeVisible();
});

// ─── Test 4: Add bill form opens and closes ───────────────────────────────────

test("add bill button opens form", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToBills(page);

  // Click "Add bill" in the panel header
  await page.getByRole("button", { name: /add bill/i }).first().click();
  await expect(page.getByPlaceholder("Netflix, Rent, Car payment...")).toBeVisible();

  // Close via backdrop click or wizard close button
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("Netflix, Rent, Car payment...")).not.toBeVisible();
});

// ─── Test 5: Mark paid ────────────────────────────────────────────────────────

test("mark paid sends correct request", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  let markPaidBody: unknown = null;

  await stubDataEndpoints(page);
  await page.route("**/api/bills**", route => {
    if (route.request().method() === "POST" && route.request().url().includes("mark-paid")) {
      markPaidBody = JSON.parse(route.request().postData() ?? "{}");
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bill: MOCK_BILL_DUE_SOON }) });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_BILLS_RESPONSE) });
    }
  });
  await page.route("**/api/bills/mark-paid**", route => {
    markPaidBody = JSON.parse(route.request().postData() ?? "{}");
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bill: MOCK_BILL_DUE_SOON }) });
  });
  await page.route("**/api/plaid/transactions**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transactions: [], accounts: [] }) })
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
  await page.getByRole("button", { name: /bills/i }).click();

  // Hover the Netflix row to reveal "Mark paid" button
  await page.getByTestId("bill-row-bill-1").hover();
  await page.getByTestId("bill-row-bill-1").getByTitle("Mark paid").click({ force: true });

  // Verify the request was sent with the right bill_id
  expect(markPaidBody).toMatchObject({ bill_id: "bill-1" });
});

// ─── Test 6: View switcher switches views ─────────────────────────────────────

test("chart and calendar view buttons switch views", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToBills(page);

  await page.getByRole("button", { name: /chart/i }).click();
  // Chart is rendered (recharts svg appears)
  await expect(page.locator("svg").first()).toBeVisible();

  await page.getByRole("button", { name: /calendar/i }).click();
  // Calendar shows weekday headers
  await expect(page.getByText("Sun").first()).toBeVisible();
  await expect(page.getByText("Mon", { exact: true })).toBeVisible();
});

// ─── Test 7: Payment history expand ──────────────────────────────────────────

test("expanding a bill row shows payment history", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToBills(page);

  // The Electricity bill has 2 payments — click its expand chevron
  await page.getByTestId("bill-row-bill-2").getByTestId("bill-expand-btn").click();

  await expect(page.getByText("Payment history")).toBeVisible();
  await expect(page.getByText("2026-05")).toBeVisible();
});

// ─── Test 8: Edit form prefills bill data ─────────────────────────────────────

test("edit button opens prefilled form", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();
  await goToBills(page);

  await page.getByTestId("bill-row-bill-2").hover();
  await page.getByTestId("bill-row-bill-2").getByTestId("bill-edit-btn").click();

  const nameInput = page.getByPlaceholder("Bill name");
  await expect(nameInput).toBeVisible();
  await expect(nameInput).toHaveValue("Electricity");
  await expect(page.getByRole("button", { name: /save changes/i })).toBeVisible();
});
