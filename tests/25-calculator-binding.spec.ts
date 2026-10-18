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
 * Everything stubbed. No live calls, no production writes. 390px.
 */

test.use({ storageState: ".playwright/user.json" });
test.use({ viewport: { width: 390, height: 844 } });

const PROPERTY_ID = "prop-e1";

interface Recorded {
  saves: Record<string, unknown>[];
  upserts: number;
}

async function stubCalculator(page: Page, recorded: Recorded, opts: { scenarios?: unknown[] } = {}) {
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

  await page.route(`**/api/properties/${PROPERTY_ID}**`, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        property: {
          id: PROPERTY_ID,
          address_line1: "1653 Sylvan Rd SW",
          city: "Atlanta",
          state: "GA",
          zip: "30310",
        },
      }),
    });
  });

  // The scenarios collection: GET lists, POST saves.
  await page.route("**/api/mortgage/scenarios**", async (route) => {
    const request = route.request();

    if (request.method() === "POST") {
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      recorded.saves.push(body);
      // A save carrying an address is the path that calls upsertProperty.
      if (body.address) recorded.upserts += 1;

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          scenario: {
            id: "a-new",
            label: String(body.label ?? ""),
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
          },
          matchedOn: body.property_id ? undefined : "created",
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scenarios: opts.scenarios ?? [] }),
    });
  });
}

// ─── Bound to a house ─────────────────────────────────────────────────────────

test("opening from a house says which house it is bound to", async ({ page }) => {
  const recorded: Recorded = { saves: [], upserts: 0 };
  await stubCalculator(page, recorded);

  await page.goto(`/tools/mortgage?property=${PROPERTY_ID}`);

  const banner = page.getByTestId("bound-property");
  await expect(banner).toContainText("1653 Sylvan Rd SW");
  await expect(banner).toContainText("Atlanta, GA, 30310");
  await expect(banner).toContainText("saves to this house");
});

test("a bound calculator does not ask for an address", async ({ page }) => {
  const recorded: Recorded = { saves: [], upserts: 0 };
  await stubCalculator(page, recorded);

  await page.goto(`/tools/mortgage?property=${PROPERTY_ID}`);
  await expect(page.getByTestId("bound-property")).toBeVisible();

  // Asking for an address already on file is what created the duplicate.
  await expect(page.getByTestId("scenario-address")).toHaveCount(0);
  await expect(page.getByTestId("scenario-city")).toHaveCount(0);
  await expect(page.getByTestId("scenario-zip")).toHaveCount(0);
});

test("a bound save sends the property id and no address", async ({ page }) => {
  const recorded: Recorded = { saves: [], upserts: 0 };
  await stubCalculator(page, recorded);

  await page.goto(`/tools/mortgage?property=${PROPERTY_ID}`);
  await expect(page.getByTestId("bound-property")).toBeVisible();

  await page.getByTestId("scenario-label").fill("at asking");
  await page.getByTestId("scenario-save").click();

  await expect.poll(() => recorded.saves.length).toBe(1);
  expect(recorded.saves[0].property_id).toBe(PROPERTY_ID);
  expect(recorded.saves[0].address).toBeUndefined();
  // The address path is the only one that reaches upsertProperty.
  expect(recorded.upserts).toBe(0);
});

test("add then run numbers then save makes one analysis on one house", async ({ page }) => {
  const recorded: Recorded = { saves: [], upserts: 0 };
  await stubCalculator(page, recorded);

  // The exact sequence that produced two properties and two analyses.
  await page.goto(`/tools/mortgage?property=${PROPERTY_ID}`);
  await expect(page.getByTestId("bound-property")).toBeVisible();

  await page.getByTestId("scenario-label").fill("at asking");
  await page.getByTestId("scenario-save").click();
  await expect.poll(() => recorded.saves.length).toBe(1);

  // One save, bound by id, no property creation.
  expect(recorded.saves).toHaveLength(1);
  expect(recorded.upserts).toBe(0);
  expect(recorded.saves[0].property_id).toBe(PROPERTY_ID);
});

test("saving twice under the same label stays one row", async ({ page }) => {
  const recorded: Recorded = { saves: [], upserts: 0 };
  await stubCalculator(page, recorded);

  await page.goto(`/tools/mortgage?property=${PROPERTY_ID}`);
  await expect(page.getByTestId("bound-property")).toBeVisible();

  for (const _ of [1, 2]) {
    await page.getByTestId("scenario-label").fill("at asking");
    await page.getByTestId("scenario-save").click();
    await expect.poll(() => recorded.saves.length).toBeGreaterThan(0);
  }

  await expect.poll(() => recorded.saves.length).toBe(2);
  // Both bound to the same house under the same label — the service matches on
  // (property, label) and versions rather than inserting again.
  expect(recorded.saves.every((s) => s.property_id === PROPERTY_ID)).toBe(true);
  expect(recorded.saves.every((s) => s.label === "at asking")).toBe(true);
  expect(recorded.upserts).toBe(0);
});

// ─── The standalone calculator ────────────────────────────────────────────────

test("the standalone calculator still asks for an address", async ({ page }) => {
  const recorded: Recorded = { saves: [], upserts: 0 };
  await stubCalculator(page, recorded);

  await page.goto("/tools/mortgage");

  await expect(page.getByTestId("bound-property")).toHaveCount(0);
  // Quick math with no house is a real case and keeps its address field.
  await expect(page.getByTestId("scenario-address")).toBeVisible();
});

test("a standalone save with an address takes the upsert path", async ({ page }) => {
  const recorded: Recorded = { saves: [], upserts: 0 };
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
  const recorded: Recorded = { saves: [], upserts: 0 };
  await stubCalculator(page, recorded);

  await page.goto("/tools/mortgage");
  await page.getByTestId("scenario-label").fill("just math");
  await page.getByTestId("scenario-save").click();

  await expect.poll(() => recorded.saves.length).toBe(1);
  expect(recorded.saves[0].address).toBeNull();
  expect(recorded.upserts).toBe(0);
});

// ─── The deep link that never worked ──────────────────────────────────────────

test("a scenario deep link opens that scenario", async ({ page }) => {
  const recorded: Recorded = { saves: [], upserts: 0 };
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

  await page.goto(`/tools/mortgage?property=${PROPERTY_ID}&scenario=a1`);

  // The Numbers tab has linked ?scenario= all along and nothing read it, so it
  // silently opened a blank calculator.
  await expect.poll(() => opened).toBe(1);
  await expect(page.getByTestId("bound-property")).toBeVisible();
});

test("the bound banner fits 390px", async ({ page }) => {
  const recorded: Recorded = { saves: [], upserts: 0 };
  await stubCalculator(page, recorded);

  await page.goto(`/tools/mortgage?property=${PROPERTY_ID}`);
  await expect(page.getByTestId("bound-property")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});
