import { test, expect } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_ACCOUNT = {
  account_id: "acc-1",
  item_id: "item-1",
  name: "Checking",
  type: "depository",
  subtype: "checking",
  balances: { current: 1000, available: 950 },
  institution_name: "Test Bank",
};

const MOCK_TX_ORIGINAL = {
  transaction_id: "tx-cat-override-1",
  account_id: "acc-1",
  merchant_name: "Whole Foods Market",
  name: "Whole Foods Market",
  amount: 84.50,
  date: "2026-07-01",
  pending: false,
  iso_currency_code: "USD",
  personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK" },
  category_override: null,
  logo_url: null,
};

// Same transaction after override saved (GENERAL_MERCHANDISE → display label "Shopping")
const MOCK_TX_OVERRIDDEN = {
  ...MOCK_TX_ORIGINAL,
  category_override: "GENERAL_MERCHANDISE",
};

const MOCK_TRANSACTIONS_ORIGINAL   = { transactions: [MOCK_TX_ORIGINAL],   accounts: [MOCK_ACCOUNT] };
const MOCK_TRANSACTIONS_OVERRIDDEN = { transactions: [MOCK_TX_OVERRIDDEN], accounts: [MOCK_ACCOUNT] };

// ─── Helper ───────────────────────────────────────────────────────────────────

async function goToTransactions(
  page: Parameters<typeof stubDataEndpoints>[0],
  txResponse = MOCK_TRANSACTIONS_ORIGINAL
) {
  await stubDataEndpoints(page);
  await page.route("**/rest/v1/plaid_items**", route =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([{ item_id: "item-1", institution_name: "Test Bank" }]),
    })
  );
  await page.route("**/api/plaid/transactions**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(txResponse) })
  );
  await page.route("**/api/bills**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bills: [] }) })
  );
  await page.goto("/finances?tab=transactions");
  await page.waitForSelector("text=Whole Foods Market", { timeout: 8000 });
}

// ─── Test 1: CategoryPill direct-click override persists across reload ────────
// Desktop path: click the pill → inline dropdown → pick.
// GENERAL_MERCHANDISE displays as "Shopping" per CATEGORY_META.

test("category override persists across page reload", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToTransactions(page);

  const initialPill = page.locator('[title="Click to change category"]').first();
  await expect(initialPill).toContainText("Food & Drink");

  let patchBody: Record<string, unknown> = {};
  await page.route("**/api/transactions/tx-cat-override-1/category**", async route => {
    const req = route.request();
    try { patchBody = await req.postDataJSON(); } catch { /* ignore */ }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  // Direct-click on the pill opens the inline dropdown (.rounded-xl)
  await initialPill.click();
  await page.locator(".rounded-xl button").filter({ hasText: "Shopping" }).first().click();

  // Optimistic update
  await expect(initialPill).toContainText("Shopping", { timeout: 3000 });
  expect(patchBody.category).toBe("GENERAL_MERCHANDISE");

  // Reload with override already in the response
  await page.unroute("**/api/plaid/transactions**");
  await page.route("**/api/plaid/transactions**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_TRANSACTIONS_OVERRIDDEN) })
  );

  await page.reload();
  await page.waitForSelector("text=Whole Foods Market", { timeout: 8000 });

  const reloadedPill = page.locator('[title="Click to change category"]').first();
  await expect(reloadedPill).toContainText("Shopping");
});

// ─── Test 2: Row menu "Change category" opens CategoryPickerModal ─────────────
// Row-menu path opens CategoryPickerModal at ALL viewport widths (no lg:hidden).
// Root cause fix: button uses onMouseDown so the handler fires before the
// document mousedown listener removes the button from the DOM.

test("row menu Change category opens CategoryPickerModal", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToTransactions(page);

  await page.route("**/api/transactions/tx-cat-override-1/category**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  );

  const firstRow = page.locator('[style*="height: 52"]').first();
  await firstRow.hover();
  await firstRow.locator("button").last().click();
  await expect(page.getByRole("button", { name: /change category/i })).toBeVisible();

  await page.getByRole("button", { name: /change category/i }).click();

  // Modal visible at all widths (lg:hidden removed)
  await expect(page.locator('[data-testid="category-picker-modal"]')).toBeVisible({ timeout: 3000 });
});

// ─── Test 3: PATCH failure reverts optimistic update ─────────────────────────

test("PATCH failure reverts category label", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await goToTransactions(page);

  await page.route("**/api/transactions/tx-cat-override-1/category**", route =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Server error" }) })
  );

  const pill = page.locator('[title="Click to change category"]').first();
  await pill.click();
  await page.locator(".rounded-xl button").filter({ hasText: "Shopping" }).first().click();

  await expect(pill).toContainText("Food & Drink", { timeout: 3000 });
});

// ─── Test 4: Mobile 390px — row menu opens CategoryPickerModal ───────────────

test("mobile 390px: row menu opens CategoryPickerModal, pick persists", async ({ page }) => {
  if (!process.env.TEST_EMAIL) test.skip();

  await page.setViewportSize({ width: 390, height: 844 });
  await goToTransactions(page);

  let patchBody: Record<string, unknown> = {};
  await page.route("**/api/transactions/tx-cat-override-1/category**", async route => {
    try { patchBody = await route.request().postDataJSON(); } catch { /* ignore */ }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  // ⋯ button always visible at mobile (max-lg:opacity-100)
  const rows = page.locator('[style*="height: 52"]');
  await rows.first().locator("button").last().click();

  const changeCatBtn = page.getByRole("button", { name: /change category/i });
  await expect(changeCatBtn).toBeVisible();
  await changeCatBtn.click();

  // Modal visible (no lg:hidden)
  const modal = page.locator('[data-testid="category-picker-modal"]');
  await expect(modal).toBeVisible({ timeout: 3000 });

  // CategoryPill column is max-lg:hidden at 390px — not in layout
  await expect(page.locator('[title="Click to change category"]').first()).not.toBeVisible();

  // Pick from modal
  await modal.locator("button").filter({ hasText: "Shopping" }).first().click();

  await expect(modal).not.toBeVisible({ timeout: 2000 });
  expect(patchBody.category).toBe("GENERAL_MERCHANDISE");

  // Mobile sub-label under merchant name updated
  await expect(page.locator("p.lg\\:hidden").first()).toContainText("Shopping");

  // Reload with override in GET response
  await page.unroute("**/api/plaid/transactions**");
  await page.route("**/api/plaid/transactions**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_TRANSACTIONS_OVERRIDDEN) })
  );

  await page.reload();
  await page.waitForSelector("text=Whole Foods Market", { timeout: 8000 });

  await expect(page.locator("p.lg\\:hidden").first()).toContainText("Shopping");
});
