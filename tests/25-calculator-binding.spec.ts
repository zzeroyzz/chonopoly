import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

/**
 * Running the numbers on a house.
 *
 * The bug: the Numbers tab sent you to the standalone calculator and told you
 * to "save with this address". Typed slightly differently the second time, it
 * hashed differently, upsertProperty could not match it, and one house became
 * two property rows with one analysis each and no primary.
 *
 * It is a modal over the house's own page now, bound to that page's
 * property_id. Which analysis is open lives in `?numbers=`, so a reload comes
 * back to the same house.
 *
 * Everything stubbed. No live calls, no production writes. 390px.
 */

test.use({ storageState: ".playwright/user.json" });
test.use({ viewport: { width: 390, height: 844 } });

const PROPERTY_ID = "prop-e1";
const HOUSE = `/properties/${PROPERTY_ID}`;

interface SavedScenario {
  id: string;
  label: string;
  homeValue: number;
  loanType: string;
  monthlyPayment: number;
  version: number;
  updatedAt: string;
  isPrimary: boolean;
  property: unknown;
  profileSnapshot: null;
}

interface Recorded {
  saves: Record<string, unknown>[];
  /** Any attempt to create a property or a pipeline entry. */
  propertyWrites: string[];
  /** What the stubbed service holds, so a second save can version it. */
  scenarios: SavedScenario[];
}

function recorder(): Recorded {
  return { saves: [], propertyWrites: [], scenarios: [] };
}

const PROPERTY = {
  id: PROPERTY_ID,
  address_line1: "1653 Sylvan Rd SW",
  city: "Atlanta",
  state: "GA",
  zip: "30310",
  annual_taxes: 4_200,
  county: "Fulton",
  parcel_number: null,
  property_type: "single_family",
  beds: 3,
  baths: 2,
  sqft: 1450,
  year_built: 1974,
  needs_address_review: false,
};

const DETAIL = {
  entry: {
    id: "e1",
    property_id: PROPERTY_ID,
    stage: "contacted",
    stage_since: "2026-08-01T00:00:00Z",
    assigned_to: null,
    source: "manual",
  },
  property: PROPERTY,
  contacts: [],
  tasks: [],
  activities: [],
  history: [],
};

async function stubHouse(page: Page, recorded: Recorded) {
  await stubDataEndpoints(page);

  await page.route("**/api/profile/buyer**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          id: "p-1",
          cashAvailable: 60_000,
          cashReserves: 10_000,
          incomes: [{ id: "i-1", label: "Salary", grossMonthly: 12_000, borrower: null }],
          debts: [],
          defaults: {
            loanType: "fha", renovationProgram: "none", interestRate: 6.5, termYears: 30,
            downPaymentPct: 3.5, closingCostPct: 5, countyLoanLimit: null,
            dpaEnabled: false, dpaStructure: "grant", dpaRate: 0, dpaTermYears: 10,
            buyingPct: 1, sellingPct: 8, holdingMonthly: 750, holdingMonths: 5,
            contingencyPhotosPct: 20, contingencyVisitPct: 10,
          },
        },
      }),
    })
  );

  // Anything that would create a house or a lead. Recorded so a test can prove
  // a save from the modal never goes near it.
  await page.route("**/api/crm/**", (route) => {
    if (route.request().method() !== "GET") {
      recorded.propertyWrites.push(`${route.request().method()} ${route.request().url()}`);
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ detail: DETAIL }),
    });
  });

  await page.route("**/api/properties/**", (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      recorded.propertyWrites.push(`${request.method()} ${request.url()}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    const url = request.url();
    if (url.includes("/comps")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ comps: [], valuation: null }),
      });
    }
    // The page asks for the whole detail; the modal's binding asks for the
    // house alone.
    const body = url.includes("detail=1") ? { detail: DETAIL } : { property: PROPERTY };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  // GET lists, POST saves. The POST mirrors the real service: same label on the
  // same house updates and versions rather than inserting a second row.
  await page.route("**/api/mortgage/scenarios**", async (route) => {
    const request = route.request();
    const url = request.url();

    // Leave the single-scenario routes to their own handlers.
    if (/\/api\/mortgage\/scenarios\/[^?]+/.test(url)) return route.fallback();

    if (request.method() === "POST") {
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      recorded.saves.push(body);

      const label = String(body.label ?? "");
      const existing = recorded.scenarios.find(
        (s) => s.label.toLowerCase() === label.toLowerCase()
      );

      let scenario: SavedScenario;
      if (existing) {
        existing.version += 1;
        existing.updatedAt = new Date().toISOString();
        scenario = existing;
      } else {
        scenario = {
          id: "a-new",
          label,
          homeValue: 250_000,
          loanType: "fha",
          monthlyPayment: 2_221,
          version: 1,
          updatedAt: new Date().toISOString(),
          isPrimary: true,
          property: body.property_id
            ? {
                id: PROPERTY_ID,
                addressLine1: "1653 Sylvan Rd SW",
                city: "Atlanta",
                state: "GA",
                zip: "30310",
                needsAddressReview: false,
              }
            : null,
          profileSnapshot: null,
        };
        recorded.scenarios.push(scenario);
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ scenario }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scenarios: recorded.scenarios }),
    });
  });
}

async function openNumbers(page: Page) {
  await page.goto(HOUSE);
  await page.getByTestId("tab-numbers").click();
  await page.getByTestId("run-numbers").click();
  await expect(page.getByTestId("numbers-modal")).toBeVisible();
}

// ─── The exact path the owner uses ────────────────────────────────────────────

test("open a house, run the numbers, save: modal closes, one analysis, no new house or lead", async ({
  page,
}) => {
  const recorded = recorder();
  await stubHouse(page, recorded);

  await openNumbers(page);

  // The modal names the house it is bound to.
  await expect(page.getByTestId("numbers-modal-house")).toContainText("1653 Sylvan Rd SW");

  await page.getByTestId("numbers-label").fill("at asking");
  await page.getByTestId("numbers-save").click();

  // Closes on save, and the Numbers tab shows the analysis.
  await expect(page.getByTestId("numbers-modal")).toHaveCount(0);
  await expect(page.getByTestId("panel-numbers")).toContainText("at asking");

  // One analysis, bound by id, and nothing created a house or a pipeline entry.
  expect(recorded.scenarios).toHaveLength(1);
  expect(recorded.saves).toHaveLength(1);
  expect(recorded.saves[0].property_id).toBe(PROPERTY_ID);
  expect(recorded.saves[0].address).toBeUndefined();
  expect(recorded.propertyWrites).toEqual([]);
});

test("saving an existing analysis adds a version", async ({ page }) => {
  const recorded = recorder();
  await stubHouse(page, recorded);

  await openNumbers(page);
  await page.getByTestId("numbers-label").fill("at asking");
  await page.getByTestId("numbers-save").click();
  await expect(page.getByTestId("numbers-modal")).toHaveCount(0);

  // Reopen that analysis from the Numbers tab and save it again.
  await page.getByTestId("analysis-a-new").click();
  await expect(page.getByTestId("numbers-modal")).toBeVisible();
  // The label comes through, so saving updates rather than naming a new one.
  await expect(page.getByTestId("numbers-label")).toHaveValue("at asking");
  await page.getByTestId("numbers-save").click();
  await expect(page.getByTestId("numbers-modal")).toHaveCount(0);

  // Same row, version 2 — not a second analysis.
  expect(recorded.scenarios).toHaveLength(1);
  expect(recorded.scenarios[0].version).toBe(2);
  expect(recorded.saves).toHaveLength(2);
  expect(recorded.saves.every((s) => s.property_id === PROPERTY_ID)).toBe(true);
  expect(recorded.propertyWrites).toEqual([]);

  // And the version is on screen, not just in the response.
  await expect(page.getByTestId("panel-numbers")).toContainText("v2");
});

test("a reload with the modal open comes back to the same house", async ({ page }) => {
  const recorded = recorder();
  await stubHouse(page, recorded);

  await openNumbers(page);
  await expect(page).toHaveURL(/\?numbers=new$/);

  await page.reload();

  // The modal state is in the URL, so it reopens on the same house.
  await expect(page.getByTestId("numbers-modal")).toBeVisible();
  await expect(page.getByTestId("numbers-modal-house")).toContainText("1653 Sylvan Rd SW");
});

test("closing with unsaved changes asks first", async ({ page }) => {
  const recorded = recorder();
  await stubHouse(page, recorded);

  await openNumbers(page);

  // Nothing typed yet: Cancel just closes.
  await page.getByTestId("numbers-cancel").click();
  await expect(page.getByTestId("numbers-modal")).toHaveCount(0);

  await page.getByTestId("run-numbers").click();
  await page.getByTestId("input-home-value").fill("377000");

  await page.getByTestId("numbers-cancel").click();
  await expect(page.getByTestId("numbers-confirm-close")).toBeVisible();

  // Keep editing leaves the work where it was.
  await page.getByTestId("numbers-keep-editing").click();
  await expect(page.getByTestId("numbers-confirm-close")).toHaveCount(0);
  await expect(page.getByTestId("input-home-value")).toHaveValue(/377/);

  await page.getByTestId("numbers-cancel").click();
  await page.getByTestId("numbers-discard").click();
  await expect(page.getByTestId("numbers-modal")).toHaveCount(0);
  expect(recorded.saves).toEqual([]);
});

test("the modal scrolls inside and Save stays visible at 390px", async ({ page }) => {
  const recorded = recorder();
  await stubHouse(page, recorded);

  await openNumbers(page);

  const save = page.getByTestId("numbers-save");
  await expect(save).toBeInViewport();

  // Scroll the body to the bottom; the footer must not have gone with it.
  const body = page.locator('[data-testid="numbers-modal"] .overflow-y-auto').first();
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(save).toBeInViewport();

  // And the page itself never scrolls sideways.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

test("the modal asks for no address", async ({ page }) => {
  const recorded = recorder();
  await stubHouse(page, recorded);

  await openNumbers(page);

  // Asking for an address already on file is what created the duplicate.
  await expect(page.getByTestId("scenario-address")).toHaveCount(0);
  await expect(page.getByTestId("scenario-city")).toHaveCount(0);
  await expect(page.getByTestId("scenario-zip")).toHaveCount(0);
});

test("the routes the modal replaced are gone", async ({ page }) => {
  const recorded = recorder();
  await stubHouse(page, recorded);

  // Refactored into the modal, not left standing beside it.
  const res = await page.goto(`${HOUSE}/numbers/new`);
  expect(res?.status()).toBe(404);
});
