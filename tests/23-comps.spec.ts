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
    reviewNotes: null,
    salePrice: null,
    saleDate: null,
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
  /** Start with every comp still to check, which opens the one-card review. */
  unreviewed?: boolean;
  /** What a refresh does. "ok" stores the fixture comps. */
  refresh?: "ok" | "crash_json" | "slow";
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

  let comps: Comp[] = options.startEmpty
    ? []
    : fixtureComps().map((c) => (options.unreviewed ? { ...c, review: "needs_review" as const } : c));
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
    reviewNotes: null,
    salePrice: null,
    saleDate: null,
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
      // The tick became a review, so the stub has to record the same thing
      // the route does — otherwise a skip changes nothing and the ARV sits
      // still while the test waits for it to move.
      const payload = JSON.parse(request.postData() ?? "{}") as {
        review?: Comp["review"];
        salePrice?: number;
        saleDate?: string;
      };
      comps = comps.map((comp) =>
        comp.id === compId
          ? {
              ...comp,
              review: payload.review ?? comp.review,
              salePrice: payload.salePrice ?? null,
              saleDate: payload.saleDate ?? null,
            }
          : comp
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

    // A crashed route: a 500 carrying the reason.
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

/*
 * Journeys only. Every message and rule this file used to check through a
 * browser is a Jest test against the function that decides it:
 *
 *   - the ARV, its basis line, the empty card     tests/unit/arv.test.ts
 *   - status labels, the sale-price prompt         tests/unit/arv.test.ts
 *   - which refresh button shows, the lock line,
 *     the cost, the cap and no-key notices,
 *     rebuild, the source line                     tests/unit/refreshControls.test.ts
 *   - no key, quota, nothing found, in flight      tests/unit/refreshMessages.test.ts
 *   - a 500's reason, an empty 500                 tests/unit/readJsonResponse.test.ts
 *   - Integrations usage and warnings              tests/unit/integrationStatus.test.ts
 *
 * The figures here come from the real calculateArv inside the stub, so the
 * journeys assert that the ARV moves, not what it moves to.
 */

const LOCKED = {
  locked: true,
  fetchedAt: "2026-10-18T12:00:00.000Z",
  nextRefreshAt: "2026-11-17T12:00:00.000Z",
  canRebuild: true,
};

/** Records every refresh POST, by body. */
function recordRefreshes(page: Page): string[] {
  const bodies: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/comps/refresh")) {
      bodies.push(req.postData() ?? "");
    }
  });
  return bodies;
}

test("refresh fills an empty tab, and a double tap sends one request", async ({ page }) => {
  await stubComps(page, { startEmpty: true, refresh: "slow" });
  await openCompsTab(page);
  const posts = recordRefreshes(page);

  await expect(page.getByTestId("comps-empty")).toBeVisible();
  await expect(page.getByTestId("arv-value")).toHaveText("—");

  // Two taps as fast as Playwright can deliver them. The button disables on
  // the first, so the second lands on a disabled control.
  const button = page.getByTestId("refresh-comps");
  await button.click();
  await expect(button).toBeDisabled();
  await button.click({ force: true, timeout: 2000 }).catch(() => {
    // Expected once it is disabled — that is the point.
  });

  await expect(page.getByTestId("comps-source")).toBeVisible();
  await expect(page.getByTestId("comp-comp-0")).toBeVisible();
  await expect(page.getByTestId("arv-value")).not.toHaveText("—");
  await expect(button).toBeEnabled();
  expect(posts).toHaveLength(1);
});

test("skipping a comp moves the ARV", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  const before = await page.getByTestId("arv-value").textContent();

  // comp-4 is the most expensive per square foot, so skipping it pulls the
  // value down.
  await page.getByTestId("comp-review-comp-4").click();
  await page.getByTestId("comp-review-comp-4-option-not_comparable_skip").click();

  await expect(page.getByTestId("arv-value")).not.toHaveText(before ?? "");
});

test("a failed refresh says why and keeps the comps already held", async ({ page }) => {
  await stubComps(page, { refresh: "crash_json" });
  await openCompsTab(page);

  await expect(page.getByTestId("comp-comp-0")).toBeVisible();
  const before = await page.getByTestId("arv-value").textContent();

  await page.getByTestId("refresh-comps").click();

  // The server's own reason reaches the screen…
  await expect(page.getByTestId("comps-error")).toContainText(
    "column analyses.home_value does not exist"
  );
  // …and the tab does not empty itself because a refresh failed.
  await expect(page.getByTestId("comp-comp-0")).toBeVisible();
  await expect(page.getByTestId("arv-value")).toHaveText(before ?? "");
});

test("a hand-entered comp is saved as a sale, with its date, and can be removed", async ({ page }) => {
  await stubComps(page);
  await openCompsTab(page);

  // A RentCast comp is unticked, never deleted, so a refresh cannot silently
  // bring it back.
  await expect(page.getByTestId("comp-remove-comp-0")).toHaveCount(0);

  await page.getByTestId("add-comp-toggle").click();
  await page.getByTestId("manual-comp-address").fill("9 Agent Closed Rd, Duluth, GA 30096");
  await page.getByTestId("manual-comp-price").fill("380000");
  await page.getByTestId("manual-comp-sqft").fill("1800");
  await page.getByTestId("manual-comp-date").fill("2026-08-15");
  await page.getByTestId("manual-comp-save").click();

  const added = page.getByTestId("comp-manual-1");
  await expect(added).toContainText("9 Agent Closed Rd");
  await expect(added).toContainText("Sold");
  await expect(page.getByTestId("comp-date-manual-1")).toHaveText("Sold Aug 2026");

  await page.getByTestId("comp-remove-manual-1").click();
  await expect(page.getByTestId("comp-manual-1")).toHaveCount(0);
});

test("refreshing early confirms, cancelling spends nothing, and accepting sends force", async ({
  page,
}) => {
  await stubComps(page, { status: LOCKED });
  await openCompsTab(page);
  const posts = recordRefreshes(page);

  await page.getByTestId("force-refresh-comps").click();
  await expect(page.getByTestId("force-confirm")).toContainText("Uses 1 of 42 remaining");
  await page.getByTestId("force-confirm-no").click();
  await expect(page.getByTestId("force-confirm")).toHaveCount(0);
  expect(posts).toHaveLength(0);

  await page.getByTestId("force-refresh-comps").click();
  await page.getByTestId("force-confirm-yes").click();
  await expect(page.getByTestId("comps-source")).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0]).force).toBe(true);
});

test("the Comps tab, its lock row, the confirm and the manual form fit 390px", async ({ page }) => {
  await stubComps(page, { status: LOCKED });
  await openCompsTab(page);

  const fits = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

  await expect(page.getByTestId("comp-comp-0")).toBeVisible();
  await expect(page.getByTestId("refresh-lock")).toBeVisible();
  expect(await fits(), "the tab with its lock row").toBe(true);

  // The price is the number that matters; the button beside it must not push
  // it off screen or overlap it.
  const value = await page.getByTestId("arv-value").boundingBox();
  const button = await page.getByTestId("force-refresh-comps").boundingBox();
  expect(value && button).toBeTruthy();
  expect(value!.x + value!.width).toBeLessThanOrEqual(button!.x + 1);
  expect(button!.x + button!.width).toBeLessThanOrEqual(390);

  await page.getByTestId("force-refresh-comps").click();
  await expect(page.getByTestId("force-confirm")).toBeVisible();
  expect(await fits(), "the confirm").toBe(true);
  await page.getByTestId("force-confirm-no").click();

  await page.getByTestId("add-comp-toggle").click();
  await expect(page.getByTestId("manual-comp-form")).toBeVisible();
  expect(await fits(), "the manual form").toBe(true);
});

// Touch, not a mouse: the owner reviews on a phone, and a sheet a mouse can
// click is not proof a thumb can tap it.
test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("the review sheet sits above the bottom bar and holds the list still, at 390px", async ({
    page,
  }) => {
    // On a phone the sheet rendered inside the house page's sheet (a stacking
    // context), so the bottom bar painted over it, and it locked the body while
    // the app scrolls its own container, so a swipe moved the list behind it.
    await stubComps(page, { unreviewed: true });
    await openCompsTab(page);
    const reviews: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "PATCH" && /\/comps\/[^/?]+/.test(req.url())) reviews.push(req.postData() ?? "");
    });

    await page.getByTestId("comp-review-answer").tap();
    const sheet = page.getByTestId("comp-review-sheet");
    await expect(sheet).toBeVisible();

    // Where the bottom bar is, the sheet is on top of it.
    const bar = page.locator("nav").filter({ has: page.getByTestId("nav-properties") }).last();
    const barBox = await bar.boundingBox();
    expect(barBox).not.toBeNull();
    const onTop = await page.evaluate(
      ({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit?.closest("nav") ? "bar" : "sheet";
      },
      { x: barBox!.x + barBox!.width / 2, y: barBox!.y + barBox!.height / 2 }
    );
    expect(onTop).toBe("sheet");

    // A swipe on the sheet does not move the list behind it.
    const scrollerTop = () =>
      page.getByTestId("comp-review-sheet").evaluate(() => {
        const card = document.querySelector('[data-testid^="comp-review-card-"]');
        for (let n = card?.parentElement ?? null; n; n = n.parentElement) {
          if (n.scrollHeight > n.clientHeight && /auto|scroll|hidden/.test(getComputedStyle(n).overflowY)) {
            return n.scrollTop;
          }
        }
        return window.scrollY;
      });
    const before = await scrollerTop();
    const sheetBox = await sheet.boundingBox();
    await page.mouse.move(sheetBox!.x + sheetBox!.width / 2, sheetBox!.y + 40);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    expect(await scrollerTop()).toBe(before);

    // Every choice is reachable, and choosing one closes the sheet and records it.
    const last = sheet.locator('[role="radio"]').last();
    await last.scrollIntoViewIfNeeded();
    await last.tap();
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => reviews.length).toBe(1);
  });
});
