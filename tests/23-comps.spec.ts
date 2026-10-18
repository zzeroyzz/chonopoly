import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";
import fixture from "./fixtures/rentcast-value.json";
import { mapComparables } from "@/lib/comps/fromRentCast";
import { calculateArv } from "@/lib/comps/arv";
import { type Comp } from "@/lib/comps/types";

/**
 * Phase 2a: the Comps tab, the ARV, and what happens when RentCast can't help.
 *
 * Everything is stubbed from the fixture — no live RentCast calls and no
 * production writes. The stub keeps its own comp list and recomputes the ARV
 * with the real calculateArv, so what the screen shows is the same arithmetic
 * the server would do rather than a hardcoded number that could agree with a
 * broken calculator.
 *
 * 390px throughout: the owner uses this on a phone.
 */

test.use({ storageState: ".playwright/user.json" });
test.use({ viewport: { width: 390, height: 844 } });

const PROPERTY_ID = "prop-e1";
const SUBJECT_SQFT = 1750;

/** The fixture's comps, in our shape, as the server would have stored them. */
function fixtureComps(): Comp[] {
  return mapComparables(fixture.comparables as never).map((mapped, index) => ({
    id: `comp-${index}`,
    propertyId: PROPERTY_ID,
    source: "rentcast" as const,
    externalId: mapped.external_id,
    formattedAddress: mapped.formatted_address,
    city: mapped.city,
    state: mapped.state,
    zip: mapped.zip,
    latitude: mapped.latitude,
    longitude: mapped.longitude,
    propertyType: mapped.property_type,
    beds: mapped.beds,
    baths: mapped.baths,
    sqft: mapped.sqft,
    lotSqft: mapped.lot_sqft,
    yearBuilt: mapped.year_built,
    price: mapped.price,
    status: mapped.status,
    listingType: mapped.listing_type,
    listedDate: mapped.listed_date,
    removedDate: mapped.removed_date,
    lastSeenDate: mapped.last_seen_date,
    daysOnMarket: mapped.days_on_market,
    distanceMiles: mapped.distance_miles,
    daysOld: mapped.days_old,
    correlation: mapped.correlation,
    included: true,
    notes: null,
    updatedAt: new Date().toISOString(),
  }));
}

function entryDetail() {
  return {
    detail: {
      entry: {
        id: "e1",
        owner_type: "personal",
        owner_id: "user-1",
        property_id: PROPERTY_ID,
        stage: "new_lead",
        stage_since: new Date().toISOString(),
        next_follow_up_at: null,
        source: "manual",
        assigned_to: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      property: {
        id: PROPERTY_ID,
        address_line1: "128 Maple St",
        city: "Duluth",
        state: "GA",
        zip: "30096",
        sqft: SUBJECT_SQFT,
        needs_address_review: false,
      },
      contacts: [],
      tasks: [],
      activities: [],
      stageHistory: [],
    },
  };
}

interface StubOptions {
  /** Start with no comps, so the empty state and a refresh can be exercised. */
  startEmpty?: boolean;
  /** What a refresh does. "ok" stores the fixture comps. */
  refresh?: "ok" | "no_key" | "quota" | "no_comps";
}

/**
 * A stateful stub of the comps endpoints.
 *
 * Holds the comp list the way the database would and recomputes the ARV on
 * every mutation with the real calculator — so a test that ticks a box is
 * checking the screen against genuine arithmetic.
 */
async function stubComps(page: Page, options: StubOptions = {}) {
  await stubDataEndpoints(page);

  let comps: Comp[] = options.startEmpty ? [] : fixtureComps();
  let manualCounter = 0;

  const body = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      comps,
      arv: calculateArv(comps, SUBJECT_SQFT),
      subjectSqft: SUBJECT_SQFT,
      ...extra,
    });

  const json = (payload: string, status = 200) => ({
    status,
    contentType: "application/json",
    body: payload,
  });

  await page.route("**/api/crm/entry/**", (route) =>
    route.fulfill(json(JSON.stringify(entryDetail())))
  );

  await page.route("**/api/crm/pipeline**", (route) =>
    route.fulfill(json(JSON.stringify({ rows: [] })))
  );

  await page.route("**/api/mortgage/scenarios**", (route) =>
    route.fulfill(json(JSON.stringify({ scenarios: [] })))
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Registration order matters and is the reverse of what reads naturally:
  // Playwright matches routes in REVERSE order of registration, so the LAST
  // one registered wins. The broad collection pattern therefore goes first and
  // the most specific route goes last, otherwise `**/comps**` swallows
  // `/comps/refresh` and `/comps/<id>` and every mutation silently returns the
  // unchanged list.
  // ─────────────────────────────────────────────────────────────────────────────

  // The collection: list and manual add.
  await page.route(`**/api/properties/*/comps**`, async (route) => {
    const request = route.request();

    if (request.method() === "POST") {
      const payload = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      manualCounter += 1;
      const comp: Comp = {
        ...fixtureComps()[0],
        id: `manual-${manualCounter}`,
        source: "manual",
        externalId: null,
        formattedAddress: String(payload.formattedAddress ?? ""),
        price: Number(payload.price ?? 0),
        sqft: payload.sqft === null ? null : Number(payload.sqft),
        // Hand-entered means a confirmed sale — the whole point of typing it in.
        status: "sold",
        correlation: null,
        distanceMiles: null,
        included: true,
        // Spreading a fixture comp carried its RentCast dates onto a manual
        // comp, which the real service never does — addManualComp writes only
        // the sale date it was given. Nulled explicitly so the stub cannot
        // invent a date the server would not have stored.
        listedDate: null,
        lastSeenDate: null,
        daysOnMarket: null,
        daysOld: null,
        removedDate:
          typeof payload.saleDate === "string" && payload.saleDate ? payload.saleDate : null,
      };
      comps = [...comps, comp];
      return route.fulfill(json(body({ comp }), 201));
    }

    return route.fulfill(json(body()));
  });

  // One comp: tick, untick, delete. The trailing `**` rather than `*` so the
  // pattern still matches once the context query string is appended.
  await page.route(`**/api/properties/*/comps/**`, async (route) => {
    const request = route.request();
    const compId = new URL(request.url()).pathname.split("/").pop() ?? "";

    if (request.method() === "PATCH") {
      const payload = JSON.parse(request.postData() ?? "{}") as { included?: boolean };
      comps = comps.map((comp) =>
        comp.id === compId ? { ...comp, included: payload.included ?? comp.included } : comp
      );
      return route.fulfill(json(body()));
    }

    if (request.method() === "DELETE") {
      comps = comps.filter((comp) => comp.id !== compId);
      return route.fulfill(json(body()));
    }

    return route.fallback();
  });

  // Refresh — the RentCast-backed route. Degraded outcomes are 200s carrying a
  // reason, which is the contract the panel relies on.
  await page.route(`**/api/properties/*/comps/refresh**`, (route) => {
    const mode = options.refresh ?? "ok";

    if (mode === "no_key") {
      return route.fulfill(
        json(
          body({
            degraded: "no_key",
            message: "RentCast isn't connected, so comps have to be entered by hand.",
          })
        )
      );
    }
    if (mode === "quota") {
      return route.fulfill(
        json(
          body({
            degraded: "quota",
            message:
              "This month's RentCast requests are used up. Comps can still be entered by hand.",
          })
        )
      );
    }
    if (mode === "no_comps") {
      return route.fulfill(
        json(
          body({
            degraded: "no_comps",
            message:
              "RentCast found no comparable sales near this address. Enter comps by hand.",
          })
        )
      );
    }

    comps = fixtureComps();
    return route.fulfill(json(body({ degraded: null, message: null })));
  });
}

async function openCompsTab(page: Page) {
  await page.goto("/properties/e1");
  await page.getByTestId("tab-comps").click();
  await expect(page.getByTestId("panel-comps")).toBeVisible();
}

// ─── The ARV ──────────────────────────────────────────────────────────────────

test("the ARV is the median price per sqft times the subject size", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  // Five usable comps at a median of $205.357/sqft × 1,750 sqft.
  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");
});

test("the ARV says what it is built on", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  // The fixture is four Inactive and one Active. None of them is a sale, and
  // the label must not imply otherwise.
  const basis = page.getByTestId("arv-basis");
  await expect(basis).toContainText("4 removed listings");
  await expect(basis).toContainText("1 active listing");
  await expect(basis).not.toContainText("sold");
  await expect(basis).toContainText("median $205/sqft");
  await expect(basis).toContainText("1,750 sqft");
});

test("a comp set with no confirmed sales carries a warning", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  const warnings = page.getByTestId("arv-warning");
  await expect(warnings.filter({ hasText: "No confirmed sales" })).toBeVisible();
  await expect(warnings.filter({ hasText: "may not have sold" })).toBeVisible();
});

test("a comp missing its size is skipped and declared", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  // The fixture's last comp has no squareFootage. Six comps listed, five used.
  await expect(page.getByTestId("arv-warning").filter({ hasText: "skipped" })).toBeVisible();
  await expect(page.getByTestId("panel-comps")).toContainText("5 comps used");
});

// ─── Checking comps off ───────────────────────────────────────────────────────

test("unticking a comp moves the ARV", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");

  // comp-4 is the $455,000 / 2,140 sqft house at $212.62/sqft — the top of the
  // range, so dropping it should pull the median down.
  await page.getByTestId("comp-include-comp-4").click();

  await expect(page.getByTestId("arv-value")).not.toHaveText("$359,375");
  const lowered = await page.getByTestId("arv-value").textContent();
  expect(lowered).toBe("$358,981");

  await expect(page.getByTestId("panel-comps")).toContainText("5 of 6 included");
});

test("reticking a comp restores the ARV", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await page.getByTestId("comp-include-comp-4").click();
  await expect(page.getByTestId("arv-value")).toHaveText("$358,981");

  await page.getByTestId("comp-include-comp-4").click();
  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");
  await expect(page.getByTestId("panel-comps")).toContainText("6 of 6 included");
});

test("comps show Removed rather than Sold", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  // The whole caveat, on screen: RentCast cannot confirm a sale.
  await expect(page.getByTestId("comp-comp-0")).toContainText("Removed");
  await expect(page.getByTestId("comp-comp-2")).toContainText("Active");

  for (const id of ["comp-0", "comp-1", "comp-3", "comp-4", "comp-5"]) {
    await expect(page.getByTestId(`comp-${id}`)).not.toContainText("Sold");
  }
});

test("each comp shows its price per sqft", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  // $345,000 / 1,680 sqft
  await expect(page.getByTestId("comp-comp-0")).toContainText("$205/sqft");
  await expect(page.getByTestId("comp-comp-0")).toContainText("$345,000");
  await expect(page.getByTestId("comp-comp-0")).toContainText("1,680 sqft");
});

// ─── Refreshing ───────────────────────────────────────────────────────────────

test("refresh pulls comps into an empty tab", async ({ page }) => {
  await stubComps(page, { startEmpty: true });
  await openCompsTab(page);

  await expect(page.getByTestId("comps-empty")).toBeVisible();
  await expect(page.getByTestId("arv-value")).toHaveText("—");

  await page.getByTestId("refresh-comps").click();

  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");
  await expect(page.getByTestId("comp-comp-0")).toBeVisible();
});

// ─── Graceful degradation ─────────────────────────────────────────────────────

test("no API key says so and points at entering comps by hand", async ({ page }) => {
  await stubComps(page, { startEmpty: true, refresh: "no_key" });
  await openCompsTab(page);

  await page.getByTestId("refresh-comps").click();

  const notice = page.getByTestId("comps-degraded");
  await expect(notice).toContainText("RentCast isn't connected");
  await expect(notice).toContainText("by hand");
  // A degraded refresh is not an error.
  await expect(page.getByTestId("comps-error")).toHaveCount(0);
});

test("an exhausted quota is distinct from a missing key", async ({ page }) => {
  await stubComps(page, { startEmpty: true, refresh: "quota" });
  await openCompsTab(page);

  await page.getByTestId("refresh-comps").click();

  const notice = page.getByTestId("comps-degraded");
  await expect(notice).toContainText("used up");
  // Nothing here should send someone hunting for a key they already have.
  await expect(notice).not.toContainText("isn't connected");
});

test("no comps found is reported rather than shown as an empty success", async ({ page }) => {
  await stubComps(page, { startEmpty: true, refresh: "no_comps" });
  await openCompsTab(page);

  await page.getByTestId("refresh-comps").click();

  await expect(page.getByTestId("comps-degraded")).toContainText("no comparable sales");
  await expect(page.getByTestId("comps-empty")).toBeVisible();
});

test("a failed refresh keeps the comps already held", async ({ page }) => {
  await stubComps(page, { refresh: "quota" });
  await openCompsTab(page);

  await expect(page.getByTestId("comp-comp-0")).toBeVisible();
  await page.getByTestId("refresh-comps").click();

  // The tab must not empty itself because a refresh failed.
  await expect(page.getByTestId("comps-degraded")).toBeVisible();
  await expect(page.getByTestId("comp-comp-0")).toBeVisible();
  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");
});

// ─── Manual comps ─────────────────────────────────────────────────────────────

test("a hand-entered comp is recorded as a confirmed sale", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await page.getByTestId("add-comp-toggle").click();
  await expect(page.getByTestId("manual-comp-form")).toContainText("confirmed sale");

  await page.getByTestId("manual-comp-address").fill("9 Agent Closed Rd, Duluth, GA 30096");
  await page.getByTestId("manual-comp-price").fill("380000");
  await page.getByTestId("manual-comp-sqft").fill("1800");
  await page.getByTestId("manual-comp-save").click();

  const added = page.getByTestId("comp-manual-1");
  await expect(added).toBeVisible();
  await expect(added).toContainText("Sold");
  await expect(added).toContainText("9 Agent Closed Rd");

  // And the warning about having no confirmed sales is gone, because now there
  // is one.
  await expect(
    page.getByTestId("arv-warning").filter({ hasText: "No confirmed sales" })
  ).toHaveCount(0);
});

test("the basis label counts the hand-entered sale", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await page.getByTestId("add-comp-toggle").click();
  await page.getByTestId("manual-comp-address").fill("9 Agent Closed Rd");
  await page.getByTestId("manual-comp-price").fill("380000");
  await page.getByTestId("manual-comp-sqft").fill("1800");
  await page.getByTestId("manual-comp-save").click();

  await expect(page.getByTestId("arv-basis")).toContainText("1 sold");
});

test("only hand-entered comps can be removed", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  // A RentCast comp is unticked, not deleted, so the next refresh cannot
  // silently bring it back.
  await expect(page.getByTestId("comp-remove-comp-0")).toHaveCount(0);

  await page.getByTestId("add-comp-toggle").click();
  await page.getByTestId("manual-comp-address").fill("9 Agent Closed Rd");
  await page.getByTestId("manual-comp-price").fill("380000");
  await page.getByTestId("manual-comp-save").click();

  await expect(page.getByTestId("comp-remove-manual-1")).toBeVisible();
  await page.getByTestId("comp-remove-manual-1").click();
  await expect(page.getByTestId("comp-manual-1")).toHaveCount(0);
});

// ─── Mobile ───────────────────────────────────────────────────────────────────

test("the Comps tab fits 390px without sideways scroll", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await expect(page.getByTestId("comp-comp-0")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

test("the manual comp form fits 390px", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await page.getByTestId("add-comp-toggle").click();
  await expect(page.getByTestId("manual-comp-form")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

test("the ARV and the refresh button share the top row without colliding", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  const value = await page.getByTestId("arv-value").boundingBox();
  const refresh = await page.getByTestId("refresh-comps").boundingBox();

  expect(value).not.toBeNull();
  expect(refresh).not.toBeNull();
  // The price is the number that matters; it must not be pushed off screen.
  expect(value!.x + value!.width).toBeLessThanOrEqual(390);
  expect(refresh!.x + refresh!.width).toBeLessThanOrEqual(390);
  expect(value!.x + value!.width).toBeLessThanOrEqual(refresh!.x + 1);
});

// ─── Comp dates ───────────────────────────────────────────────────────────────

test("each comp shows the date that matters for its status", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  // A bare date leaves the reader guessing whether the house sold then or just
  // came to market, so the label names which date it is.
  await expect(page.getByTestId("comp-date-comp-0")).toHaveText("Removed Jul 2026");
  await expect(page.getByTestId("comp-date-comp-2")).toHaveText("Listed Sep 2026");
});

test("a hand-entered comp with no date given shows none", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await page.getByTestId("add-comp-toggle").click();
  await page.getByTestId("manual-comp-address").fill("9 Agent Closed Rd");
  await page.getByTestId("manual-comp-price").fill("380000");
  await page.getByTestId("manual-comp-save").click();

  await expect(page.getByTestId("comp-manual-1")).toContainText("Sold");
  // No date is better than a borrowed one. An agent's list does not always
  // carry the close date, and a fabricated one would misrepresent how stale
  // the comp is.
  await expect(page.getByTestId("comp-date-manual-1")).toHaveCount(0);
});

test("a hand-entered comp records the sale date it was given", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await page.getByTestId("add-comp-toggle").click();
  await page.getByTestId("manual-comp-address").fill("9 Agent Closed Rd");
  await page.getByTestId("manual-comp-price").fill("380000");
  await page.getByTestId("manual-comp-date").fill("2026-08-15");
  await page.getByTestId("manual-comp-save").click();

  await expect(page.getByTestId("comp-date-manual-1")).toHaveText("Sold Aug 2026");
});

// ─── Settings → Integrations ──────────────────────────────────────────────────

async function stubIntegration(
  page: Page,
  status: { connected: boolean; used: number; limit?: number }
) {
  await stubDataEndpoints(page);
  const limit = status.limit ?? 50;

  await page.route("**/api/integrations/rentcast**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: status.connected,
        usage: {
          used: status.used,
          limit,
          fraction: status.used / limit,
          monthStart: "2026-10-01T00:00:00.000Z",
        },
        warningFraction: 0.8,
        nearLimit: status.used / limit >= 0.8,
        atLimit: status.used >= limit,
      }),
    })
  );
}

test("Integrations shows this month's usage against the limit", async ({ page }) => {
  await stubIntegration(page, { connected: true, used: 12 });
  await page.goto("/settings/integrations");

  await expect(page.getByTestId("rentcast-connected")).toHaveText("Connected");
  await expect(page.getByTestId("rentcast-usage")).toContainText("12");
  await expect(page.getByTestId("rentcast-usage")).toContainText("of 50 this month");
  await expect(page.getByTestId("rentcast-integration")).toContainText("38 left");

  // Well under the line, so no warning.
  await expect(page.getByTestId("rentcast-near-limit")).toHaveCount(0);
  await expect(page.getByTestId("rentcast-at-limit")).toHaveCount(0);
});

test("Integrations warns at 80% of the monthly allowance", async ({ page }) => {
  await stubIntegration(page, { connected: true, used: 40 });
  await page.goto("/settings/integrations");

  const warning = page.getByTestId("rentcast-near-limit");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("80%");
  await expect(warning).toContainText("10 left");
  // Still usable, so not the hard-stop message.
  await expect(page.getByTestId("rentcast-at-limit")).toHaveCount(0);
});

test("Integrations says what still works once the allowance is gone", async ({ page }) => {
  await stubIntegration(page, { connected: true, used: 50 });
  await page.goto("/settings/integrations");

  const atLimit = page.getByTestId("rentcast-at-limit");
  await expect(atLimit).toBeVisible();
  await expect(atLimit).toContainText("used up");
  await expect(atLimit).toContainText("by hand");
});

test("Integrations reports a missing key without ever showing one", async ({ page }) => {
  await stubIntegration(page, { connected: false, used: 0 });
  await page.goto("/settings/integrations");

  await expect(page.getByTestId("rentcast-connected")).toHaveText("Not connected");
  await expect(page.getByTestId("rentcast-integration")).toContainText("entered by hand");

  // There is nothing useful to do with a fragment of an API key, so none is
  // rendered — not even masked.
  await expect(page.getByTestId("rentcast-integration")).not.toContainText("•••");
  await expect(page.getByTestId("rentcast-integration")).not.toContainText("API key");
});

test("Integrations is reachable from the settings nav at 390px", async ({ page }) => {
  await stubIntegration(page, { connected: true, used: 12 });
  await page.goto("/settings/profile");

  await page.getByTestId("settings-tab-integrations").click();
  await expect(page).toHaveURL(/\/settings\/integrations$/);
  await expect(page.getByTestId("rentcast-integration")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});
