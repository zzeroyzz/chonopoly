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

/*
 * What moved to Jest: asking for income with no profile (verdicts.test.ts,
 * needsProfile); one profile reused for every house (resolveInputs.test.ts);
 * the defaults' values (defaults.ts). The Integrations wording is
 * tests/unit/integrationStatus.test.ts.
 */

test("first run: named debts give a verdict without leaving the calculator", async ({ page }) => {
  await stubProfileApi(page, null);
  await openCalculator(page);

  await page.getByTestId("set-income").click();
  // Each debt is a name and an amount, so it can be audited and excluded later.
  await page.getByTestId("income-name-0").fill("Salary");
  await page.getByTestId("income-amount-0").fill("9000");
  await page.getByTestId("debt-name-0").fill("Car loan");
  await page.getByTestId("debt-amount-0").fill("600");
  await page.getByTestId("save-profile").click();

  // The prompt is gone and the ratios are live, on the same screen.
  await expect(page.getByTestId("set-income")).toHaveCount(0);
  await expect(page.getByText("$9,000", { exact: true })).toBeVisible();
  await expect(page.getByText(/under|over/).first()).toBeVisible();
  // From here on the figures are read-only, edited in Settings.
  await expect(page.getByRole("link", { name: /Edit in Settings/ })).toBeVisible();
});

test("settings shows the profile, the tabs move, and defaults save", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await stubDataEndpoints(page);
  await page.goto("/settings/profile");

  await expect(page.getByTestId("settings-income-name-0")).toHaveValue("Salary");
  await expect(page.getByTestId("settings-debt-name-0")).toHaveValue("Car loan");
  await expect(page.getByTestId("settings-debt-amount-0")).toHaveValue("600");

  await page.getByTestId("settings-tab-defaults").click();
  await page.getByLabel("Interest rate").fill("7.25");
  await page.getByTestId("save-settings-defaults").click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("settings, defaults, integrations and the calculator fit 390px", async ({ page }) => {
  await stubProfileApi(page, SALARY);
  await stubDataEndpoints(page);
  await page.route("**/api/integrations/rentcast**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: true,
        usage: { used: 12, limit: 50, fraction: 0.24, monthStart: "2026-10-01T00:00:00.000Z" },
        warningFraction: 0.8,
        nearLimit: false,
        atLimit: false,
      }),
    })
  );

  const fits = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

  await page.goto("/settings/profile");
  await expect(page.getByTestId("settings-income-name-0")).toBeVisible();
  expect(await fits(), "profile").toBe(true);

  await page.getByTestId("settings-tab-defaults").click();
  await expect(page.getByLabel("Interest rate")).toBeVisible();
  expect(await fits(), "defaults").toBe(true);

  await page.getByTestId("settings-tab-integrations").click();
  await expect(page.getByTestId("rentcast-integration")).toBeVisible();
  expect(await fits(), "integrations").toBe(true);

  await openCalculator(page);
  expect(await fits(), "calculator").toBe(true);
});
