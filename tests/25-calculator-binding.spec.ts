import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

/**
 * The calculator's binding to a house.
 *
 * The bug: opening the calculator from a property gave no binding, so saving
 * asked for the address again. Typed slightly differently the second time, it
 * hashed differently, upsertProperty could not match it, and one house became
 * two property rows with one analysis each and no primary.
 *
 * The binding is now the house's UUID in the path —
 * /properties/[id]/numbers/new — so it survives a reload and there is no
 * address to retype.
 *
 * Everything stubbed. No live calls, no production writes. 390px.
 */

test.use({ storageState: ".playwright/user.json" });
test.use({ viewport: { width: 390, height: 844 } });

const PROPERTY_ID = "prop-e1";
const NEW_ANALYSIS = `/properties/${PROPERTY_ID}/numbers/new`;

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
  /** Saves carrying an address — the only path that reaches upsertProperty. */
  upserts: number;
  /** Any attempt to create a property or a pipeline entry. */
  propertyWrites: string[];
  /** What the stubbed service is holding, so a second save can version it. */
  scenarios: SavedScenario[];
}

function recorder(): Recorded {
  return { saves: [], upserts: 0, propertyWrites: [], scenarios: [] };
}

const PROPERTY = {
  id: PROPERTY_ID,
  address_line1: "1653 Sylvan Rd SW",
  city: "Atlanta",
  state: "GA",
  zip: "30310",
  annual_taxes: 4_200,
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
  property: { ...PROPERTY, county: "Fulton", parcel_number: null, property_type: "single_family", beds: 3, baths: 2, sqft: 1450, year_built: 1974, needs_address_review: false },
  contacts: [],
  tasks: [],
  activities: [],
  history: [],
};

async function stubCalculator(page: Page, recorded: Recorded) {
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
  // a bound save never goes near it.
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

  await page.route(`**/api/properties/${PROPERTY_ID}**`, (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      recorded.propertyWrites.push(`${request.method()} ${request.url()}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    // The property page asks for the whole detail; the calculator's binding
    // asks for the house alone.
    const body = request.url().includes("detail=1")
      ? { detail: DETAIL }
      : { property: PROPERTY };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  // The scenarios collection: GET lists, POST saves. The POST mirrors the real
  // service — same label on the same house updates and versions, rather than
  // inserting a second row.
  await page.route("**/api/mortgage/scenarios**", async (route) => {
    const request = route.request();
    const url = request.url();

    // Leave the single-scenario routes to their own handlers.
    if (/\/api\/mortgage\/scenarios\/[^?]+/.test(url)) return route.fallback();

    if (request.method() === "POST") {
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      recorded.saves.push(body);
      if (body.address) recorded.upserts += 1;

      const label = String(body.label ?? "");
      const boundTo = body.property_id ? PROPERTY_ID : null;
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
          property: boundTo
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
        body: JSON.stringify({
          scenario,
          matchedOn: body.property_id ? undefined : "created",
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scenarios: recorded.scenarios }),
    });
  });
}

// ─── Bound to a house, by route ───────────────────────────────────────────────

test("opening from a house says which house it is bound to", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  await page.goto(NEW_ANALYSIS);

  const banner = page.getByTestId("bound-property");
  await expect(banner).toContainText("1653 Sylvan Rd SW");
  await expect(banner).toContainText("Atlanta, GA, 30310");
  await expect(banner).toContainText("saves to this house");
});

test("a bound calculator does not ask for an address", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  await page.goto(NEW_ANALYSIS);
  await expect(page.getByTestId("bound-property")).toBeVisible();

  // Asking for an address already on file is what created the duplicate.
  await expect(page.getByTestId("scenario-address")).toHaveCount(0);
  await expect(page.getByTestId("scenario-city")).toHaveCount(0);
  await expect(page.getByTestId("scenario-zip")).toHaveCount(0);
});

test("a bound save sends the property id and no address", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  await page.goto(NEW_ANALYSIS);
  await expect(page.getByTestId("bound-property")).toBeVisible();

  await page.getByTestId("scenario-label").fill("at asking");
  await page.getByTestId("scenario-save").click();

  await expect.poll(() => recorded.saves.length).toBe(1);
  expect(recorded.saves[0].property_id).toBe(PROPERTY_ID);
  expect(recorded.saves[0].address).toBeUndefined();
  expect(recorded.upserts).toBe(0);
});

// ─── The exact path the owner uses ────────────────────────────────────────────

test("open a house, run the numbers, save: one analysis, no new house or lead", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  // Start on the house, the way it is actually reached.
  await page.goto(`/properties/${PROPERTY_ID}`);
  await page.getByTestId("tab-numbers").click();

  const runNumbers = page.getByTestId("run-numbers");
  await expect(runNumbers).toBeVisible();
  // The link is keyed by the house, not by a query string to be dropped.
  await expect(runNumbers).toHaveAttribute("href", NEW_ANALYSIS);
  await runNumbers.click();

  await expect(page).toHaveURL(new RegExp(`${NEW_ANALYSIS}$`));
  await expect(page.getByTestId("bound-property")).toContainText("1653 Sylvan Rd SW");

  await page.getByTestId("scenario-label").fill("at asking");
  await page.getByTestId("scenario-save").click();
  await expect.poll(() => recorded.saves.length).toBe(1);

  // One analysis, bound by id.
  expect(recorded.scenarios).toHaveLength(1);
  expect(recorded.saves[0].property_id).toBe(PROPERTY_ID);
  // Nothing created a house, and nothing created a pipeline entry.
  expect(recorded.upserts).toBe(0);
  expect(recorded.propertyWrites).toEqual([]);

  // Back on the house, still one house.
  await page.goBack();
  await page.getByTestId("tab-numbers").click();
  await expect(page.getByTestId("panel-numbers")).toBeVisible();
  expect(recorded.propertyWrites).toEqual([]);
});

test("saving again versions the same analysis rather than adding one", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  await page.goto(NEW_ANALYSIS);
  await expect(page.getByTestId("bound-property")).toBeVisible();

  // Waiting on an exact count each time. `toBeGreaterThan(0)` was satisfied by
  // the first save, so the second click raced it — and the save clears the
  // label field, so the refill has to happen after the first has landed.
  await page.getByTestId("scenario-label").fill("at asking");
  await page.getByTestId("scenario-save").click();
  await expect.poll(() => recorded.saves.length).toBe(1);

  await page.getByTestId("scenario-label").fill("at asking");
  await page.getByTestId("scenario-save").click();
  await expect.poll(() => recorded.saves.length).toBe(2);

  // Same row, version 2 — not a second analysis.
  expect(recorded.scenarios).toHaveLength(1);
  expect(recorded.scenarios[0].version).toBe(2);
  expect(recorded.scenarios[0].id).toBe("a-new");
  expect(recorded.saves.every((s) => s.property_id === PROPERTY_ID)).toBe(true);
  expect(recorded.upserts).toBe(0);

  // And the version is on screen, not just in the response.
  await expect(page.getByText("· v2")).toBeVisible();
});

test("a reload mid-calculation keeps the binding and the draft", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  await page.goto(NEW_ANALYSIS);
  await expect(page.getByTestId("bound-property")).toBeVisible();

  const price = page.getByTestId("input-home-value");
  await price.fill("377000");
  // The draft is written on change; give it the tick it needs before reloading.
  await expect(price).toHaveValue(/377/);

  await page.reload();

  // The UUID is in the path, so the binding cannot be lost by a reload.
  await expect(page.getByTestId("bound-property")).toContainText("1653 Sylvan Rd SW");
  await expect(page.getByTestId("input-home-value")).toHaveValue(/377/);
});

test("one house's draft does not surface on another", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  await page.goto(NEW_ANALYSIS);
  await expect(page.getByTestId("bound-property")).toBeVisible();
  await page.getByTestId("input-home-value").fill("377000");
  await expect(page.getByTestId("input-home-value")).toHaveValue(/377/);

  // A different house, whose calculator must open on its own numbers.
  await page.goto("/tools/mortgage");
  await expect(page.getByTestId("input-home-value")).not.toHaveValue(/377/);
});

// ─── The standalone calculator ────────────────────────────────────────────────

test("the standalone calculator still asks for an address", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  await page.goto("/tools/mortgage");

  await expect(page.getByTestId("bound-property")).toHaveCount(0);
  // Quick math with no house is a real case and keeps its address field. It is
  // also the only place in the app that asks for an address.
  await expect(page.getByTestId("scenario-address")).toBeVisible();
});

test("a standalone save with an address takes the upsert path", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  await page.goto("/tools/mortgage");
  await page.getByTestId("scenario-label").fill("quick look");
  await page.getByTestId("scenario-address").fill("9 New St");
  await page.getByTestId("scenario-save").click();

  await expect.poll(() => recorded.saves.length).toBe(1);
  expect(recorded.saves[0].property_id).toBeUndefined();
  expect(recorded.upserts).toBe(1);
});

test("a standalone save with no address attaches no house", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  await page.goto("/tools/mortgage");
  await page.getByTestId("scenario-label").fill("just math");
  await page.getByTestId("scenario-save").click();

  await expect.poll(() => recorded.saves.length).toBe(1);
  expect(recorded.saves[0].address).toBeNull();
  expect(recorded.upserts).toBe(0);
});

test("an old ?property= bookmark still binds rather than duplicating", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  // Links shipped before the route existed. Dropping the fallback would send
  // them down the address path, which is the duplicate-creating one.
  await page.goto(`/tools/mortgage?property=${PROPERTY_ID}`);

  await expect(page.getByTestId("bound-property")).toContainText("1653 Sylvan Rd SW");
  await expect(page.getByTestId("scenario-address")).toHaveCount(0);
});

// ─── Opening an existing analysis ─────────────────────────────────────────────

test("an analysis route opens that analysis, bound to its house", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  let opened = 0;
  await page.route("**/api/mortgage/scenarios/a1**", (route) => {
    opened += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scenario: {
          id: "a1",
          label: "at asking",
          inputs: { homeValue: 312_500, loanType: "fha", interestRate: 6.5 },
        },
      }),
    });
  });

  await page.goto(`/properties/${PROPERTY_ID}/numbers/a1`);

  // The Numbers tab linked ?scenario= all along and nothing read it, so it
  // silently opened a blank calculator.
  await expect.poll(() => opened).toBe(1);
  await expect(page.getByTestId("bound-property")).toBeVisible();
  await expect(page.getByTestId("input-home-value")).toHaveValue(/312/);
});

test("the bound banner fits 390px", async ({ page }) => {
  const recorded = recorder();
  await stubCalculator(page, recorded);

  await page.goto(NEW_ANALYSIS);
  await expect(page.getByTestId("bound-property")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});
