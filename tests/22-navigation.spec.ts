import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

/**
 * Phase 1b: the property page and the new navigation.
 *
 * At 390px, where the bottom bar is the navigation — five slots is the ceiling
 * and the app now has exactly five destinations, so nothing hides behind a
 * drawer.
 *
 * Everything is stubbed. No production writes.
 */
test.use({ viewport: { width: 390, height: 844 } });

function entry(id: string, address: string, stage = "new_lead") {
  return {
    entry: {
      id,
      owner_type: "personal",
      owner_id: "user-1",
      property_id: `prop-${id}`,
      stage,
      stage_since: new Date().toISOString(),
      next_follow_up_at: null,
      source: "manual",
      assigned_to: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    addressLine1: address,
    city: "Duluth",
    openTasks: [],
  };
}

async function stubCrm(page: Page) {
  await stubDataEndpoints(page);

  await page.route("**/api/crm/pipeline**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rows: [entry("e1", "128 Maple St"), entry("e2", "44 Oak Ave", "contacted")] }),
    })
  );

  await page.route("**/api/properties/*?*detail=1*", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          entry: entry("e1", "128 Maple St").entry,
          property: {
            id: "prop-e1",
            address_line1: "128 Maple St",
            city: "Duluth",
            state: "GA",
            zip: "30096",
            property_type: "single_family",
            beds: 3,
            baths: 2,
            sqft: 1750,
            year_built: 1994,
            annual_taxes: null,
            listing_url: null,
            needs_address_review: false,
          },
          contacts: [],
          tasks: [],
          activities: [],
          history: [],
        },
      }),
    })
  );

  await page.route("**/api/crm/entry/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          entry: entry("e1", "128 Maple St").entry,
          property: {
            id: "prop-e1",
            address_line1: "128 Maple St",
            city: "Duluth",
            state: "GA",
            zip: "30096",
            property_type: "single_family",
            beds: 3,
            baths: 2,
            sqft: 1750,
            year_built: 1994,
            annual_taxes: null,
            listing_url: null,
            needs_address_review: false,
          },
          contacts: [],
          tasks: [],
          activities: [],
          stageHistory: [],
        },
      }),
    })
  );

  // The Properties page is the screen table now, and it reads this endpoint
  // rather than the pipeline. Without the stub this suite reached the real API,
  // which made the nav test depend on live data and timing — it waited on a
  // nav bar that never settled.
  await page.route("**/api/properties/screen**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) })
  );

  await page.route("**/api/mortgage/scenarios**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scenarios: [
          {
            id: "a1",
            label: "at asking",
            homeValue: 250000,
            loanType: "fha",
            monthlyPayment: 2221,
            version: 1,
            updatedAt: new Date().toISOString(),
            isPrimary: true,
            property: null,
            profileSnapshot: null,
          },
        ],
      }),
    })
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

test("the bottom bar holds all five destinations", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/pipeline");

  for (const id of ["pipeline", "properties", "add", "tools", "settings"]) {
    await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
  }
});

test("the nav reaches every section", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/pipeline");

  await page.getByTestId("nav-properties").click();
  await expect(page).toHaveURL(/\/properties$/);

  await page.getByTestId("nav-add").click();
  await expect(page).toHaveURL(/\/properties\/new$/);

  await page.getByTestId("nav-tools").click();
  await expect(page).toHaveURL(/\/tools\/mortgage$/);

  await page.getByTestId("nav-settings").click();
  await expect(page).toHaveURL(/\/settings\/profile$/);

  await page.getByTestId("nav-pipeline").click();
  await expect(page).toHaveURL(/\/pipeline$/);
});

test("the active destination follows the route", async ({ page }) => {
  await stubCrm(page);

  await page.goto("/properties");
  await expect(page.getByTestId("nav-properties")).toHaveAttribute("aria-current", "page");

  // Longest prefix wins, so /properties/new is Add rather than Properties.
  await page.goto("/properties/new");
  await expect(page.getByTestId("nav-add")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("nav-properties")).not.toHaveAttribute("aria-current", "page");
});

test("Tools lists only calculators that exist", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/tools/mortgage");

  // No "soon" cards: a nav item pointing at a 404 is worse than a missing one.
  await expect(page.getByText(/Cash flow analysis/)).toHaveCount(0);
  await expect(page.getByText(/Market analysis/)).toHaveCount(0);
});

// ─── Redirects ────────────────────────────────────────────────────────────────

const REDIRECTS: [string, RegExp][] = [
  ["/app", /\/pipeline$/],
  ["/crm", /\/pipeline$/],
  ["/crm/tasks", /\/pipeline\/tasks$/],
  ["/crm/dashboard", /\/pipeline\/dashboard$/],
  ["/mortgage", /\/tools\/mortgage$/],
  ["/profile", /\/settings\/account$/],
  ["/more", /\/pipeline$/],
  ["/cash-flow", /\/pipeline$/],
  ["/markets", /\/pipeline$/],
];

for (const [from, to] of REDIRECTS) {
  test(`${from} redirects`, async ({ page }) => {
    await stubCrm(page);
    await page.goto(from);
    await expect(page).toHaveURL(to);
  });
}

test("a property deep link keeps its id", async ({ page }) => {
  await stubCrm(page);
  // The case that matters: someone following an old link to one house should
  // land on that house, not on a list.
  await page.goto("/crm/e1");
  await expect(page).toHaveURL(/\/properties\/e1$/);
  await expect(page.getByText("128 Maple St").first()).toBeVisible();
});

// ─── The property page ────────────────────────────────────────────────────────

test("the property page has five tabs and they switch", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties/e1");

  for (const t of ["overview", "numbers", "comps", "rehab", "activity"]) {
    await expect(page.getByTestId(`tab-${t}`)).toBeVisible();
  }

  await expect(page.getByTestId("panel-overview")).toBeVisible();

  // The tab was renamed Comps -> ARV and this spec was never updated.
  await page.getByTestId("tab-arv").click();
  await expect(page.getByTestId("panel-comps")).toBeVisible();
  await expect(page.getByTestId("panel-overview")).toHaveCount(0);

  await page.getByTestId("tab-activity").click();
  await expect(page.getByTestId("panel-activity")).toBeVisible();
});

test("the Numbers tab lists this property's analyses", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties/e1");

  await page.getByTestId("tab-numbers").click();
  await expect(page.getByTestId("analysis-a1")).toBeVisible();
  await expect(page.getByText("at asking")).toBeVisible();
  // The scenario the other tabs mean when they say "the price".
  await expect(page.getByText("primary")).toBeVisible();
});

test("Rehab still says which phase fills it", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties/e1");

  // Comps used to carry the same "arrives with the screening step" placeholder.
  // It is a real panel now, covered by 23-comps.spec.ts; Rehab is still a
  // placeholder until the estimating phase lands.
  await page.getByTestId("tab-rehab").click();
  await expect(page.getByTestId("panel-rehab")).toContainText(/estimating step/);
});

test("the property page fits 390px", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties/e1");
  await expect(page.getByTestId("tab-overview")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

test("the hub is gone", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/app");

  await expect(page).toHaveURL(/\/pipeline$/);
  await expect(page.getByText("Pick where you're working")).toHaveCount(0);
});

// ─── House facts are editable ─────────────────────────────────────────────────

test("property type reads as a label, not a database value", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties/e1");

  // "single_family" on a detail page is showing the database to the user.
  await expect(page.getByText("Single family")).toBeVisible();
  await expect(page.getByText("single_family")).toHaveCount(0);
});

test("house facts can be edited", async ({ page }) => {
  await stubCrm(page);

  const patches: string[] = [];
  await page.route("**/api/properties/*", async (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postData() ?? "");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ property: { id: "prop-e1" } }),
      });
    }
    return route.fallback();
  });

  await page.goto("/properties/e1");
  await page.getByTestId("edit-house-toggle").click();
  await expect(page.getByTestId("edit-house-form")).toBeVisible();

  // The two the owner named: sqft and the address.
  await page.getByTestId("edit-house-sqft").fill("1875");
  await page.getByTestId("edit-house-address").fill("128 Maple Street");
  await page.getByTestId("edit-house-save").click();

  expect(patches).toHaveLength(1);
  const sent = JSON.parse(patches[0]);
  expect(sent.sqft).toBe(1875);
  expect(sent.addressLine1).toBe("128 Maple Street");
});

test("the edit form says hand-entered facts win", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties/e1");

  await page.getByTestId("edit-house-toggle").click();
  // Otherwise a correction looks like it might be overwritten on the next
  // refresh, which is exactly what used to happen.
  await expect(page.getByTestId("edit-house-form")).toContainText("wins over RentCast");
});

test("cancelling the edit form changes nothing", async ({ page }) => {
  await stubCrm(page);

  let patches = 0;
  await page.route("**/api/properties/*", async (route) => {
    if (route.request().method() === "PATCH") patches += 1;
    return route.fallback();
  });

  await page.goto("/properties/e1");
  await page.getByTestId("edit-house-toggle").click();
  await page.getByTestId("edit-house-sqft").fill("9999");
  await page.getByTestId("edit-house-cancel").click();

  await expect(page.getByTestId("edit-house-form")).toHaveCount(0);
  expect(patches).toBe(0);
});

test("the edit form fits 390px", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties/e1");

  await page.getByTestId("edit-house-toggle").click();
  await expect(page.getByTestId("edit-house-form")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});
