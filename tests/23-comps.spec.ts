import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";
import fixture from "@/lib/rentcast/fixtures/valueEstimate.json";
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
    buyerType: null,
    buyerName: null,
    county: null,
    included: true,
    review: "renovated_use",
    reviewSetAt: null,
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
  refresh?: "ok" | "no_key" | "quota" | "no_comps" | "crash_empty" | "crash_json" | "in_flight" | "slow";
  /** The quota guard's view of this house, as GET /comps/refresh reports it. */
  status?: Partial<RefreshStatusStub>;
}

/** Mirrors what GET /api/properties/:id/comps/refresh returns. */
interface RefreshStatusStub {
  usage: { used: number; cap: number; planLimit: number; remaining: number; atCap: boolean };
  mode: "live" | "mock";
  connected: boolean;
  locked: boolean;
  fetchedAt: string | null;
  nextRefreshAt: string | null;
  canForce: boolean;
  canRebuild: boolean;
  windowDays: number;
}

function defaultStatus(): RefreshStatusStub {
  return {
    usage: { used: 3, cap: 45, planLimit: 50, remaining: 42, atCap: false },
    mode: "live",
    connected: true,
    locked: false,
    fetchedAt: null,
    nextRefreshAt: null,
    canForce: true,
    canRebuild: false,
    windowDays: 30,
  };
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

  // The property page reads its detail from the property route now, not from
  // the CRM entry route above. Registered here, ahead of the comps routes, so
  // the reverse-order rule below still leaves those in charge of their URLs.
  // Without this the detail request went unstubbed, the page never rendered,
  // and every test in this file timed out waiting for a tab.
  await page.route("**/api/properties/*", (route) => {
    if (!route.request().url().includes("detail=1")) return route.fallback();
    return route.fulfill(json(JSON.stringify(entryDetail())));
  });

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
    review: "renovated_use",
    reviewSetAt: null,
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

  // GET on the refresh route is the quota guard's status. Same URL as the POST
  // below, so the handler branches on method.
  const status = { ...defaultStatus(), ...(options.status ?? {}) };

  // Refresh — the RentCast-backed route. Degraded outcomes are 200s carrying a
  // reason, which is the contract the panel relies on.
  await page.route(`**/api/properties/*/comps/refresh**`, async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(json(JSON.stringify(status)));
    }

    const mode = options.refresh ?? "ok";

    // Hold the response open long enough that a second tap would overlap it.
    if (mode === "slow") {
      await new Promise((resolve) => setTimeout(resolve, 600));
      comps = fixtureComps();
      return route.fulfill(
        json(
          body({
            degraded: null,
            message: null,
            source: "live",
            fetchedAt: "2026-10-18T12:00:00.000Z",
            nextRefreshAt: "2026-11-17T12:00:00.000Z",
          })
        )
      );
    }

    // What the route returns when another caller already holds the lock.
    if (mode === "in_flight") {
      return route.fulfill(
        json(
          body({
            degraded: "in_flight",
            message: "A lookup for this address is already running. Give it a moment and reload.",
          })
        )
      );
    }

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

    // A crashed route with no body at all — what a thrown PostgREST error used
    // to produce, and what turned a real message into
    // "Unexpected end of JSON input".
    if (mode === "crash_empty") {
      return route.fulfill({ status: 500, contentType: "application/json", body: "" });
    }

    // The same crash after the fix: still a 500, but carrying the reason.
    if (mode === "crash_json") {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: 'column analyses.home_value does not exist' }),
      });
    }

    comps = fixtureComps();
    return route.fulfill(
      json(
        body({
          degraded: null,
          message: null,
          source: "live",
          fetchedAt: "2026-10-18T12:00:00.000Z",
          nextRefreshAt: "2026-11-17T12:00:00.000Z",
          usage: { used: 4, cap: 45, planLimit: 50, remaining: 41, atCap: false },
        })
      )
    );
  });
}

async function openCompsTab(page: Page) {
  await page.goto("/properties/e1");
  // The tab was renamed Comps -> ARV and these specs were never updated, so
  // every test here spent 30s waiting for a testid the app stopped rendering.
  await page.getByTestId("tab-arv").click();
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

test("skipping a comp moves the ARV", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");

  // comp-4 is the $455,000 / 2,140 sqft house at $212.62/sqft — the top of the
  // range, so skipping it should pull the median down.
  await page.getByTestId("comp-review-comp-4").click();
  await page.getByTestId("comp-review-comp-4-option-not_comparable_skip").click();

  await expect(page.getByTestId("arv-value")).not.toHaveText("$359,375");
  const lowered = await page.getByTestId("arv-value").textContent();
  expect(lowered).toBe("$358,981");

  await expect(page.getByTestId("panel-comps")).toContainText("5 of 6 approved");
});

test("approving a comp again restores the ARV", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await page.getByTestId("comp-review-comp-4").click();
  await page.getByTestId("comp-review-comp-4-option-not_comparable_skip").click();
  await expect(page.getByTestId("arv-value")).toHaveText("$358,981");

  await page.getByTestId("comp-review-comp-4").click();
  await page.getByTestId("comp-review-comp-4-option-renovated_use").click();
  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");
  await expect(page.getByTestId("panel-comps")).toContainText("6 of 6 approved");
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


// ─── A crashed route ──────────────────────────────────────────────────────────

test("a 500 carrying a reason shows that reason", async ({ page }) => {
  await stubComps(page, { refresh: "crash_json" });
  await openCompsTab(page);

  await page.getByTestId("refresh-comps").click();

  // The server's actual message, not a parser complaint.
  const error = page.getByTestId("comps-error");
  await expect(error).toContainText("column analyses.home_value does not exist");
  await expect(error).not.toContainText("Unexpected end of JSON input");
});

test("a 500 with an empty body still reads as a server error", async ({ page }) => {
  await stubComps(page, { refresh: "crash_empty" });
  await openCompsTab(page);

  await page.getByTestId("refresh-comps").click();

  // This is the exact shape that produced "Unexpected end of JSON input" on
  // production. The status is checked before parsing, so the user gets
  // something attributable instead.
  const error = page.getByTestId("comps-error");
  await expect(error).toContainText("HTTP 500");
  await expect(error).not.toContainText("Unexpected end of JSON input");
  await expect(error).not.toContainText("JSON.parse");
});

test("a crashed refresh leaves the comps and the ARV alone", async ({ page }) => {
  await stubComps(page, { refresh: "crash_empty" });
  await openCompsTab(page);

  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");
  await page.getByTestId("refresh-comps").click();

  await expect(page.getByTestId("comps-error")).toBeVisible();
  // A failed refresh must not empty the tab.
  await expect(page.getByTestId("comp-comp-0")).toBeVisible();
  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");
});

// ─── The quota guard ──────────────────────────────────────────────────────────

const LOCKED = {
  locked: true,
  fetchedAt: "2026-10-18T12:00:00.000Z",
  nextRefreshAt: "2026-11-17T12:00:00.000Z",
  canRebuild: true,
};

test("a locked house says when it can be refreshed again", async ({ page }) => {
  await stubComps(page, { status: LOCKED });
  await openCompsTab(page);

  // The exact sentence the owner asked for.
  await expect(page.getByTestId("refresh-lock")).toHaveText(
    "Comps from Oct 18 · refresh available Nov 17"
  );
});

test("a locked house offers Refresh early instead of Refresh", async ({ page }) => {
  await stubComps(page, { status: LOCKED });
  await openCompsTab(page);

  await expect(page.getByTestId("force-refresh-comps")).toBeVisible();
  // Not a button that silently does something different.
  await expect(page.getByTestId("refresh-comps")).toHaveCount(0);
});

test("an unlocked house just offers Refresh", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await expect(page.getByTestId("refresh-comps")).toBeVisible();
  await expect(page.getByTestId("force-refresh-comps")).toHaveCount(0);
  await expect(page.getByTestId("refresh-lock")).toHaveCount(0);
});

test("forcing a refresh confirms, and says what it costs", async ({ page }) => {
  await stubComps(page, { status: LOCKED });
  await openCompsTab(page);

  await page.getByTestId("force-refresh-comps").click();

  // "Are you sure?" with no number attached is a prompt people learn to
  // dismiss without reading.
  await expect(page.getByTestId("force-confirm")).toContainText(
    "Uses 1 of 42 remaining this month"
  );
});

test("cancelling the confirm spends nothing", async ({ page }) => {
  await stubComps(page, { status: LOCKED });
  await openCompsTab(page);

  let refreshPosts = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/comps/refresh")) refreshPosts += 1;
  });

  await page.getByTestId("force-refresh-comps").click();
  await page.getByTestId("force-confirm-no").click();

  await expect(page.getByTestId("force-confirm")).toHaveCount(0);
  await expect(page.getByTestId("refresh-lock")).toBeVisible();
  expect(refreshPosts).toBe(0);
});

test("accepting the confirm sends force", async ({ page }) => {
  await stubComps(page, { status: LOCKED });
  await openCompsTab(page);

  const bodies: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/comps/refresh")) {
      bodies.push(req.postData() ?? "");
    }
  });

  await page.getByTestId("force-refresh-comps").click();
  await page.getByTestId("force-confirm-yes").click();

  await expect(page.getByTestId("comps-source")).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(JSON.parse(bodies[0]).force).toBe(true);
});

test("the confirm panel fits 390px", async ({ page }) => {
  await stubComps(page, { status: LOCKED });
  await openCompsTab(page);

  await page.getByTestId("force-refresh-comps").click();
  await expect(page.getByTestId("force-confirm")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

test("a non-owner cannot force a refresh", async ({ page }) => {
  await stubComps(page, { status: { ...LOCKED, canForce: false } });
  await openCompsTab(page);

  // The quota is shared, so spending it early is the owner's call. The route
  // enforces this too — the disabled button is the courtesy, not the control.
  await expect(page.getByTestId("force-refresh-comps")).toBeDisabled();
});

test("at the monthly cap Refresh is removed and the reason given", async ({ page }) => {
  await stubComps(page, {
    status: { usage: { used: 45, cap: 45, planLimit: 50, remaining: 0, atCap: true } },
  });
  await openCompsTab(page);

  // This previously showed a disabled "Limit reached" button. A control that
  // cannot do anything is worse than no control, so it is gone and the reason
  // stands in its place.
  await expect(page.getByTestId("refresh-comps")).toHaveCount(0);
  await expect(page.getByTestId("force-refresh-comps")).toHaveCount(0);
  await expect(page.getByTestId("refresh-at-cap")).toHaveCount(0);

  const notice = page.getByTestId("refresh-cap-notice");
  await expect(notice).toContainText("45 of 45");
  await expect(notice).toContainText("until next month");
  await expect(notice).toContainText("by hand");
});

test("manual comps still work at the cap", async ({ page }) => {
  await stubComps(page, {
    status: { usage: { used: 45, cap: 45, planLimit: 50, remaining: 0, atCap: true } },
  });
  await openCompsTab(page);

  // Running out of API requests must not stop the work.
  await page.getByTestId("add-comp-toggle").click();
  await page.getByTestId("manual-comp-address").fill("9 Agent Closed Rd");
  await page.getByTestId("manual-comp-price").fill("380000");
  await page.getByTestId("manual-comp-save").click();

  await expect(page.getByTestId("comp-manual-1")).toBeVisible();
  await expect(page.getByTestId("comp-manual-1")).toContainText("Sold");
});

test("comps say when they came from the saved response", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await page.getByTestId("refresh-comps").click();
  // A cached or sample set must not be mistaken for a fresh lookup.
  await expect(page.getByTestId("comps-source")).toContainText("fresh from RentCast");
});

test("rebuild is offered when a saved response exists, and never calls out", async ({ page }) => {
  await stubComps(page, { status: LOCKED });
  await openCompsTab(page);

  const bodies: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/comps/refresh")) {
      bodies.push(req.postData() ?? "");
    }
  });

  await expect(page.getByTestId("rebuild-comps")).toBeVisible();
  await page.getByTestId("rebuild-comps").click();

  await expect(page.getByTestId("comps-source")).toBeVisible();
  expect(bodies).toHaveLength(1);
  // The request the route refuses to make a call for.
  expect(JSON.parse(bodies[0]).rebuild).toBe(true);
  expect(JSON.parse(bodies[0]).force).toBeUndefined();
});

test("rebuild is hidden when nothing has been saved", async ({ page }) => {
  await stubComps(page, { status: { canRebuild: false } });
  await openCompsTab(page);

  await expect(page.getByTestId("rebuild-comps")).toHaveCount(0);
});

test("the lock row fits 390px", async ({ page }) => {
  await stubComps(page, { status: LOCKED });
  await openCompsTab(page);

  await expect(page.getByTestId("refresh-lock")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});


// ─── One call in flight per address ───────────────────────────────────────────

test("a double tap sends one request, not two", async ({ page }) => {
  await stubComps(page, { refresh: "slow" });
  await openCompsTab(page);

  const posts: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/comps/refresh")) posts.push(req.url());
  });

  // Two taps as fast as Playwright can deliver them. The button disables on the
  // first, so the second lands on a disabled control.
  const button = page.getByTestId("refresh-comps");
  await button.click();
  await button.click({ force: true, timeout: 2000 }).catch(() => {
    // Expected once it is disabled — that is the point of the test.
  });

  await expect(page.getByTestId("comps-source")).toBeVisible();
  expect(posts).toHaveLength(1);
});

test("the button is disabled while a refresh is running", async ({ page }) => {
  await stubComps(page, { refresh: "slow" });
  await openCompsTab(page);

  await page.getByTestId("refresh-comps").click();
  // The client-side half of "one call per address". The database lock is the
  // half that survives two people on two devices.
  await expect(page.getByTestId("refresh-comps")).toBeDisabled();
  await expect(page.getByTestId("comps-source")).toBeVisible();
  await expect(page.getByTestId("refresh-comps")).toBeEnabled();
});

test("losing the lock race reports it without emptying the tab", async ({ page }) => {
  await stubComps(page, { refresh: "in_flight" });
  await openCompsTab(page);

  await page.getByTestId("refresh-comps").click();

  await expect(page.getByTestId("comps-degraded")).toContainText("already running");
  // Returning what we hold beats spending a second request on the same answer.
  await expect(page.getByTestId("comp-comp-0")).toBeVisible();
  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");
});

test("Integrations says when a deployment never calls RentCast", async ({ page }) => {
  await stubDataEndpoints(page);
  await page.route("**/api/integrations/rentcast**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: false,
        mode: "mock",
        usage: { used: 0, limit: 45, planLimit: 50, fraction: 0, monthStart: "2026-10-01T00:00:00.000Z" },
        cap: 45,
        cacheWindowDays: 30,
        warningFraction: 0.8,
        nearLimit: false,
        atLimit: false,
      }),
    })
  );
  await page.goto("/settings/integrations");

  // A counter stuck at zero on preview should explain itself rather than look
  // like a broken integration.
  await expect(page.getByTestId("rentcast-mock-mode")).toContainText("never calls RentCast");
  await expect(page.getByTestId("rentcast-integration")).toContainText("once every 30 days");
  await expect(page.getByTestId("rentcast-integration")).toContainText("stops at 45");
});

// ─── Refresh is hidden when it cannot work ────────────────────────────────────

test("no RentCast key hides Refresh and says why", async ({ page }) => {
  await stubComps(page, { status: { connected: false } });
  await openCompsTab(page);

  // A button that cannot do anything is worse than no button.
  await expect(page.getByTestId("refresh-comps")).toHaveCount(0);
  await expect(page.getByTestId("force-refresh-comps")).toHaveCount(0);

  const notice = page.getByTestId("refresh-unavailable");
  await expect(notice).toContainText("isn't connected");
  await expect(notice).toContainText("by hand");
});

test("manual comps still work with no key", async ({ page }) => {
  await stubComps(page, { status: { connected: false } });
  await openCompsTab(page);

  // Losing the integration must not stop the work.
  await page.getByTestId("add-comp-toggle").click();
  await page.getByTestId("manual-comp-address").fill("9 Agent Closed Rd");
  await page.getByTestId("manual-comp-price").fill("380000");
  await page.getByTestId("manual-comp-save").click();

  await expect(page.getByTestId("comp-manual-1")).toBeVisible();
});

// ─── The ARV card says one thing, not two ─────────────────────────────────────

test("an empty ARV card does not say the same thing twice", async ({ page }) => {
  await stubComps(page, { startEmpty: true });
  await openCompsTab(page);

  await expect(page.getByTestId("arv-value")).toHaveText("—");

  // It said "Built on no comps" directly above "No comps are included yet".
  await expect(page.getByTestId("arv-basis")).toHaveCount(0);
  await expect(page.getByTestId("arv-warning").filter({ hasText: "No comps are included" })).toBeVisible();
});

test("the basis line returns once there is a number", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  await expect(page.getByTestId("arv-value")).toHaveText("$359,375");
  await expect(page.getByTestId("arv-basis")).toContainText("4 removed listings");
});
