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

  // Next's dev indicator renders into <nextjs-portal> and sits bottom-left by
  // default — over the first bottom-bar tabs and over the edit dialog's Save.
  // It swallowed those clicks, which is why the nav and edit tests failed
  // only on slower runs, once it had rendered. It is framework chrome, not
  // the app, so the tests look past it rather than designing around it.
  // The standing fix is `devIndicators: false` in next.config.ts, which is
  // build config and wants the owner's say-so.
  // Applied per load rather than via addInitScript: the overlay mounts after
  // hydration, so a style appended before parsing does not survive to meet it.
  page.on("load", () => {
    void page
      .addStyleTag({ content: "nextjs-portal{display:none!important}" })
      .catch(() => {
        /* Navigated away mid-injection; the next load re-applies it. */
      });
  });

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
            // listScenarios always returns `inputs`, and the property page
            // reads the primary's renovationBudget straight off it. Without
            // it here the page threw on every test that visited a house —
            // the fixture was describing a response the API never sends.
            inputs: { homeValue: 250_000, loanType: "fha", renovationBudget: 0 },
          },
        ],
      }),
    })
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

test("the nav reaches every section, and the active tab follows", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties");

  for (const id of ["companies", "properties", "add", "tools", "settings"]) {
    await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("nav-properties")).toHaveAttribute("aria-current", "page");

  // Longest prefix wins, so /properties/new is Add rather than Properties.
  await page.getByTestId("nav-add").click();
  await expect(page).toHaveURL(/\/properties\/new$/);
  await expect(page.getByTestId("nav-add")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("nav-properties")).not.toHaveAttribute("aria-current", "page");

  await page.getByTestId("nav-tools").click();
  await expect(page).toHaveURL(/\/tools\/mortgage$/);

  await page.getByTestId("nav-companies").click();
  await expect(page).toHaveURL(/\/companies$/);

  // The last slot is you: no caption, so its accessible name is what names it.
  const you = page.getByTestId("nav-settings");
  await expect(you).toHaveAttribute("aria-label", "You");
  await you.click();
  await expect(page).toHaveURL(/\/settings$/);

  // The hub, at phone width, opens the areas behind it.
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  );
  expect(fits, "the settings hub fits 390px").toBe(true);
  await page.getByTestId("hub-defaults").click();
  await expect(page).toHaveURL(/\/settings\/defaults$/);
});

/**
 * The shell is drawn once.
 *
 * Every page used to render its own AppShell, so a tab change unmounted the
 * whole frame and built a new one — not a document reload, but a rebuild of
 * everything inside it, which is what made switching tabs look like one.
 *
 * Tagging the node is the only way to tell the difference from the outside: a
 * rebuilt nav is a different element and loses the attribute, while a nav that
 * was never unmounted still carries it.
 */
test("the shell survives a tab change instead of being rebuilt", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties");

  const nav = page.locator('nav[aria-label="Main"]');
  await expect(nav).toBeVisible();
  await nav.evaluate((el) => el.setAttribute("data-probe", "same-node"));

  await page.getByTestId("nav-tools").click();
  await expect(page).toHaveURL(/\/tools\/mortgage$/);

  await expect(nav).toHaveAttribute("data-probe", "same-node");
  await expect(page.getByTestId("nav-tools")).toHaveAttribute("aria-current", "page");
});

// ─── Redirects ────────────────────────────────────────────────────────────────

// Everything that used to land on the pipeline lands on Properties now. The
// pipeline's own routes are gone, so a redirect still pointing at one would
// send an old bookmark to a 404 — which is the thing this test exists to stop.
const REDIRECTS: [string, RegExp][] = [
  ["/app", /\/properties$/],
  ["/crm", /\/properties$/],
  ["/crm/tasks", /\/properties$/],
  ["/crm/dashboard", /\/properties$/],
  ["/mortgage", /\/tools\/mortgage$/],
  ["/profile", /\/settings\/account$/],
  ["/more", /\/properties$/],
  ["/cash-flow", /\/properties$/],
  ["/markets", /\/properties$/],
  // An old link to one house lands on that house, not on a list.
  ["/crm/e1", /\/properties\/e1$/],
];

test("old routes redirect, and the routes the modal replaced are gone", async ({ page }) => {
  await stubCrm(page);
  for (const [from, to] of REDIRECTS) {
    await page.goto(from);
    await expect(page, from).toHaveURL(to);
  }

  // The Numbers page was refactored into a modal, not left standing beside it.
  const res = await page.goto("/properties/e1/numbers/new");
  expect(res?.status()).toBe(404);
});

// ─── The property page ────────────────────────────────────────────────────────

test("the property page's tabs switch to their panels", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties/e1");

  for (const t of ["details", "arv", "numbers", "deal", "rehab", "activity"]) {
    await expect(page.getByTestId(`tab-${t}`)).toBeVisible();
  }
  // The Details tab's panel still carries its old testid.
  await expect(page.getByTestId("panel-overview")).toBeVisible();

  await page.getByTestId("tab-arv").click();
  await expect(page.getByTestId("panel-comps")).toBeVisible();
  await expect(page.getByTestId("panel-overview")).toHaveCount(0);

  await page.getByTestId("tab-numbers").click();
  await expect(page.getByTestId("scenario-a1")).toBeVisible();

  await page.getByTestId("tab-rehab").click();
  await expect(page.getByTestId("rehab-roof")).toBeVisible();

  await page.getByTestId("tab-activity").click();
  await expect(page.getByTestId("panel-activity")).toBeVisible();
});

test("the property page fits 390px", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties/e1");
  await expect(page.getByTestId("tab-details")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

test("without a photo, the sheet does not cover the house's facts", async ({ page }) => {
  // The stub's house has no photo. The sheet rides up 20px over the header,
  // and on a house without a photo it used to cover the bottom of the spec
  // line.
  await stubCrm(page);
  await page.goto("/properties/e1");
  await expect(page.getByTestId("tab-details")).toBeVisible();

  const gap = await page.evaluate(() => {
    const facts = document.querySelector('[data-testid="house-facts"]');
    const sheet = document.querySelector('[data-testid="house-sheet"]');
    const last = facts?.lastElementChild;
    if (!last || !sheet) return null;
    return sheet.getBoundingClientRect().top - last.getBoundingClientRect().bottom;
  });
  expect(gap).not.toBeNull();
  expect(gap ?? -1).toBeGreaterThanOrEqual(0);
});

// ─── House facts are editable ─────────────────────────────────────────────────

/** Records every PATCH to the house, answering each as saved. */
async function recordPatches(page: Page): Promise<string[]> {
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
  return patches;
}

test("house facts can be edited, a photo link included, and cancel sends nothing", async ({ page }) => {
  await stubCrm(page);
  const patches = await recordPatches(page);
  await page.goto("/properties/e1");

  // Cancelling changes nothing.
  await page.getByTestId("edit-house-toggle").click();
  await page.getByTestId("edit-house-sqft").fill("9999");
  await page.getByTestId("edit-house-cancel").click();
  await expect(page.getByTestId("edit-house-form")).toHaveCount(0);
  expect(patches).toHaveLength(0);

  // The two the owner named, sqft and the address, plus a pasted photo link.
  await page.getByTestId("edit-house-toggle").click();
  await page.getByTestId("edit-house-sqft").fill("1875");
  await page.getByTestId("edit-house-address").fill("128 Maple Street");
  await page.getByTestId("edit-house-photo").fill("https://example.com/house.jpg");
  await expect(page.getByTestId("edit-house-photo-preview")).toBeVisible();
  await page.getByTestId("edit-house-save").click();

  expect(patches).toHaveLength(1);
  const sent = JSON.parse(patches[0]);
  expect(sent.sqft).toBe(1875);
  expect(sent.addressLine1).toBe("128 Maple Street");
  expect(sent.photoUrl).toBe("https://example.com/house.jpg");
});

test("the edit form opens over the page with Save reachable at 390px", async ({ page }) => {
  await stubCrm(page);
  await page.goto("/properties/e1");

  await page.getByTestId("edit-house-toggle").click();

  // Inline, the form once rendered below the fold and the tap looked like it
  // did nothing. It is a dialog now, and a full-bleed one fails by pushing its
  // footer off the bottom of a phone rather than by overflowing sideways.
  await expect(page.getByRole("dialog", { name: "Edit this house" })).toBeVisible();
  await expect(page.getByTestId("edit-house-save")).toBeInViewport();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});
