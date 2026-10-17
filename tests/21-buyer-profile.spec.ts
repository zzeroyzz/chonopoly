import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

/**
 * Phase 0: the buyer profile.
 *
 * At 390px, like everything else in this app — the owner works it on a phone.
 *
 * The profile API is stubbed. These tests are about what the user experiences:
 * enter income once, have every house use it, and be told when a saved verdict
 * was run against numbers that have since moved. Writing to the live table
 * would leave rows behind and make the suite depend on what is already there.
 */
test.use({ viewport: { width: 390, height: 844 } });

interface Income { id: string; label: string; incomeType: string; grossMonthly: number; borrower: null }
interface Debt { id: string; label: string; debtType: string; monthlyPayment: number; includeInRatios: boolean }

function buildProfile(incomes: Income[], debts: Debt[]) {
  return {
    id: "p-1",
    cashAvailable: 0,
    cashReserves: 0,
    defaults: {
      loanType: "fha", renovationProgram: "none", interestRate: 6.75, termYears: 30,
      downPaymentPct: 3.5, closingCostPct: 5, countyLoanLimit: null,
      dpaEnabled: false, dpaStructure: "grant", dpaRate: 0, dpaTermYears: 10,
      buyingPct: 1, sellingPct: 8, holdingMonthly: 750, holdingMonths: 5,
      contingencyPhotosPct: 20, contingencyVisitPct: 10,
    },
    incomes,
    debts,
  };
}

/** A stand-in for buyer_profiles, so create-then-read behaves as it would live. */
async function stubProfileApi(
  page: Page,
  seed: ReturnType<typeof buildProfile> | null = null
) {
  let profile = seed;

  await page.route("**/api/profile/buyer", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ profile }),
      });
    }

    if (method === "POST") {
      const body = route.request().postDataJSON() as {
        incomes: { label: string; grossMonthly: number }[];
        debts: { label: string; monthlyPayment: number }[];
      };
      profile = buildProfile(
        body.incomes.map((i, n) => ({
          id: `i-${n}`, label: i.label, incomeType: "w2", grossMonthly: i.grossMonthly, borrower: null,
        })),
        body.debts.map((d, n) => ({
          id: `d-${n}`, label: d.label, debtType: "other", monthlyPayment: d.monthlyPayment, includeInRatios: true,
        }))
      );
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ profile }),
      });
    }

    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ profile }),
    });
  });
}

async function openCalculator(page: Page) {
  await stubDataEndpoints(page);
  await page.addInitScript(() => window.localStorage.removeItem("mortgageCalculatorInputs"));
  await page.goto("/mortgage");
  await expect(page.getByText("Affordability").first()).toBeVisible();
}

const SALARY = buildProfile(
  [{ id: "i-1", label: "Salary", incomeType: "w2", grossMonthly: 9000, borrower: null }],
  [{ id: "d-1", label: "Car loan", debtType: "auto", monthlyPayment: 600, includeInRatios: true }]
);

test("with no profile, the calculator asks for income instead of inventing one", async ({ page }) => {
  await stubProfileApi(page, null);
  await openCalculator(page);

  await expect(page.getByTestId("set-income")).toBeVisible();
  // The old hardcoded $9,000 must not appear anywhere.
  await expect(page.getByText("9,000")).toHaveCount(0);
});

test("the first-run modal takes named debts, not a lump sum", async ({ page }) => {
  await stubProfileApi(page, null);
  await openCalculator(page);
  await page.getByTestId("set-income").click();

  // Each debt is a name and an amount, so it can be audited and excluded later.
  await expect(page.getByTestId("debt-name-0")).toBeVisible();
  await expect(page.getByTestId("debt-amount-0")).toBeVisible();
  await expect(page.getByText(/Name each one/)).toBeVisible();
});

test("saving the modal produces a verdict without leaving the calculator", async ({ page }) => {
  await stubProfileApi(page, null);
  await openCalculator(page);

  await page.getByTestId("set-income").click();
  await page.getByTestId("income-name-0").fill("Salary");
  await page.getByTestId("income-amount-0").fill("9000");
  await page.getByTestId("debt-name-0").fill("Car loan");
  await page.getByTestId("debt-amount-0").fill("600");
  await page.getByTestId("save-profile").click();

  // The prompt is gone and the ratios are live, on the same screen.
  await expect(page.getByTestId("set-income")).toHaveCount(0);
  await expect(page.getByText("$9,000", { exact: true })).toBeVisible();
  await expect(page.getByText(/under|over/).first()).toBeVisible();
});

test("the modal is first-run only — afterwards the figures are read-only", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await openCalculator(page);

  await expect(page.getByTestId("set-income")).toHaveCount(0);
  await expect(page.getByText("$9,000", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Edit in Settings/ })).toBeVisible();
});

test("income is entered once and used without re-entry", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await openCalculator(page);

  // No income field to fill in — it comes from the profile.
  await expect(page.getByLabel("Gross monthly income")).toHaveCount(0);
  await expect(page.getByText("1 income · 1 debt counted.")).toBeVisible();

  // And it reaches the ratios: 9,000 income with 600 of debt.
  await expect(page.getByText("$600", { exact: true })).toBeVisible();
});

test("a second house reuses the same profile with nothing re-entered", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await openCalculator(page);

  const price = page.locator('input:not([type="checkbox"])').first();
  await price.fill("250000");
  await price.blur();
  await expect(page.getByText("$9,000", { exact: true })).toBeVisible();

  // Change the house; the profile figures stay put.
  await price.fill("410000");
  await price.blur();
  await expect(page.getByText("$9,000", { exact: true })).toBeVisible();
  await expect(page.getByTestId("set-income")).toHaveCount(0);
});

test("the settings screen lists each debt by name and amount", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await stubDataEndpoints(page);
  await page.goto("/settings/profile");

  await expect(page.getByTestId("settings-income-name-0")).toHaveValue("Salary");
  await expect(page.getByTestId("settings-income-amount-0")).toHaveValue("9000");
  await expect(page.getByTestId("settings-debt-name-0")).toHaveValue("Car loan");
  await expect(page.getByTestId("settings-debt-amount-0")).toHaveValue("600");
  await expect(page.getByText("Counted in ratios $600/mo")).toBeVisible();
});

test("settings fits 390px without horizontal overflow", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await stubDataEndpoints(page);
  await page.goto("/settings/profile");
  await expect(page.getByTestId("settings-income-name-0")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

test("the calculator fits 390px with the profile shown", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await openCalculator(page);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});
