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

/**
 * Every run starts from the empty state, and nothing is left behind.
 *
 * Not by cleaning up afterwards — by never writing in the first place. Each
 * test seeds its own in-memory profile, so there is no shared state between
 * runs and no row to delete. `assertNothingEscaped` below enforces that: if a
 * profile request ever reaches the real server, the test fails rather than
 * quietly creating a row in production.
 */
const escaped: string[] = [];

/** A stand-in for buyer_profiles, so create-then-read behaves as it would live. */
async function stubProfileApi(
  page: Page,
  seed: ReturnType<typeof buildProfile> | null = null
) {
  let profile = seed;

  // Anything the stub does not claim would hit the database. Record it.
  page.on("request", (req) => {
    if (req.url().includes("/api/profile/") && !req.url().includes("/api/profile/buyer")) {
      escaped.push(`${req.method()} ${req.url()}`);
    }
  });

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

/**
 * The teardown. Asserts the suite wrote nothing, rather than deleting what it
 * wrote — the suite is not permitted to write production data at all.
 */
test.afterEach(() => {
  expect(escaped, `unstubbed profile requests reached the server: ${escaped.join(", ")}`).toEqual([]);
  escaped.length = 0;
});

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

// ─── Settings → defaults ──────────────────────────────────────────────────────

test("the defaults screen edits loan and flip costs", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await stubDataEndpoints(page);
  await page.goto("/settings/defaults");

  await expect(page.getByLabel("Interest rate")).toHaveValue("6.75");
  await expect(page.getByLabel("Term")).toHaveValue("30");
  await expect(page.getByRole("textbox", { name: /^Down payment/ })).toHaveValue("3.5");
  // Flip costs live here too, saved now so they are ready for Phase 4.
  await expect(page.getByLabel("Selling costs")).toHaveValue("8");
  await expect(page.getByLabel("Contingency — photo estimate")).toHaveValue("20");
});

test("the assistance fields appear only when assistance is on", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await stubDataEndpoints(page);
  await page.goto("/settings/defaults");

  // SALARY has dpaEnabled false, so the structure picker is hidden.
  await expect(page.getByLabel("Structure")).toHaveCount(0);

  await page.getByText("I'm using an assistance program by default").click();
  await expect(page.getByLabel("Structure")).toBeVisible();
});

test("defaults saves and reports it", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await stubDataEndpoints(page);
  await page.goto("/settings/defaults");

  await page.getByLabel("Interest rate").fill("7.25");
  await page.getByTestId("save-settings-defaults").click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("the settings tabs move between the screens", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await stubDataEndpoints(page);

  await page.goto("/settings/profile");
  await page.getByTestId("settings-tab-defaults").click();
  await expect(page.getByLabel("Interest rate")).toBeVisible();

  await page.getByTestId("settings-tab-profile").click();
  await expect(page.getByTestId("settings-income-name-0")).toBeVisible();

  // Integrations is a real screen now — it carries the RentCast usage counter,
  // added with the comps work. Team still has none, so it still has no tab.
  await expect(page.getByTestId("settings-tab-integrations")).toBeVisible();
  await expect(page.getByTestId("settings-tab-team")).toHaveCount(0);
});

test("the defaults screen fits 390px without horizontal overflow", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await stubDataEndpoints(page);
  await page.goto("/settings/defaults");
  await expect(page.getByLabel("Interest rate")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

test("defaults explains itself when there is no profile yet", async ({ page }) => {
  await stubProfileApi(page, null);
  await stubDataEndpoints(page);
  await page.goto("/settings/defaults");

  await expect(page.getByText(/haven't set up a profile yet/)).toBeVisible();
});
