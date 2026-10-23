import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

/**
 * Phase 2b: batch add and the screen table.
 *
 * Everything stubbed. No live calls and no production writes.
 * 390px throughout — the owner works on a phone.
 */

test.use({ storageState: ".playwright/user.json" });
test.use({ viewport: { width: 390, height: 844 } });

interface RowOverrides {
  propertyId?: string;
  address?: string;
  affordability?: "qualifies" | "tight" | "does_not_qualify";
  affordabilitySummary?: string;
  needsProfile?: boolean;
  deal?: "works" | "thin" | "does_not_work";
  dealSummary?: string;
  hasArv?: boolean;
  arv?: number | null;
  profit?: number | null;
  approvedComps?: number;
  compsToReview?: number;
  checklist?: Partial<{ numbers: boolean; comps: boolean; estimate: boolean; visit: boolean }>;
  needsAddressReview?: boolean;
  listingUrl?: string | null;
  listPrice?: number | null;
  photoUrl?: string | null;
  walkAwayCash?: number | null;
  isFinalist?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

function row(overrides: RowOverrides = {}) {
  const checklist = {
    numbers: true,
    comps: true,
    estimate: false,
    visit: false,
    ...(overrides.checklist ?? {}),
  };

  return {
    propertyId: overrides.propertyId ?? "prop-1",
    entryId: "e1",
    address: overrides.address ?? "128 Maple St, Duluth, GA, 30096",
    needsAddressReview: overrides.needsAddressReview ?? false,
    price: 250_000,
    piti: 2_221,
    backDti: 34,
    cashToClose: 18_500,
    arv: overrides.arv === undefined ? 359_375 : overrides.arv,
    maxOffer: 231_562,
    profit: overrides.profit === undefined ? 52_000 : overrides.profit,
    marginPct: 14.5,
    affordability: {
      verdict: overrides.affordability ?? "qualifies",
      reasons: [],
      summary: overrides.affordabilitySummary ?? "Within your ratios and cash",
      ratiosApply: true,
      needsProfile: overrides.needsProfile ?? false,
    },
    deal: {
      verdict: overrides.deal ?? "works",
      reasons: [],
      summary: overrides.dealSummary ?? "$52,000 profit at 15% margin",
      provisional: false,
      hasArv: overrides.hasArv ?? true,
    },
    checklist: {
      ...checklist,
      done: [checklist.numbers, checklist.comps, checklist.estimate, checklist.visit].filter(Boolean)
        .length,
    },
    // Required by the card, and never supplied here — so every test in this
    // file rendered an empty list and failed on a missing testid, long before
    // the review work touched it.
    explanations: {
      afford: {
        whatsWrong: overrides.affordabilitySummary ?? "Within your ratios and cash",
        target: "Needs $42,000 at closing, $12,000 available",
      },
      deal: {
        whatsWrong: overrides.dealSummary ?? "$52,000 profit at 15% margin",
        target: "15% margin on the resale price",
      },
      arv: null,
    },
    approvedComps: overrides.approvedComps ?? 0,
    compsToReview: overrides.compsToReview ?? 0,
    listingUrl: overrides.listingUrl ?? null,
    // The photo card's own facts. The asking price is separate from `price`,
    // which falls back to the calculator default.
    listPrice: overrides.listPrice === undefined ? 250_000 : overrides.listPrice,
    beds: 3,
    baths: 2,
    sqft: 1_750,
    photoUrl: overrides.photoUrl ?? null,
    walkAwayCash: overrides.walkAwayCash === undefined ? 41_000 : overrides.walkAwayCash,
    trueProfit: 52_000,
    isFinalist: overrides.isFinalist ?? false,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
  };
}

/** A one-pixel PNG, standing in for every map tile. */
const BLANK_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

async function stubScreen(page: Page, rows: unknown[]) {
  await stubDataEndpoints(page);
  // No live map tiles: they spend the owner's Carto quota and the network
  // makes the test slower, and none of these tests reads a street.
  await page.route("**/basemaps.cartocdn.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: BLANK_TILE })
  );
  await page.route("**/api/properties/screen**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rows }),
    })
  );
}

/**
 * A tap at the middle of an element, wherever the pointer lands.
 *
 * `locator.click()` refuses when another element covers its target, and on
 * this card the card-wide link is meant to cover the price and the photo —
 * that is what makes the whole card open the house.
 */
async function tapCentre(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} is not on screen`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/*
 * Journeys only. What the card says (verdicts and reasons, the price wording,
 * the steps count and where it links, "Resale price not checked yet") is
 * tested against the functions that decide it: verdicts.test.ts,
 * cardSteps.test.ts, specLine.test.ts and screenRow.test.ts. The map's count of
 * unplaced houses is mapPins.test.ts. Paste parsing is parseAddressLines.test.ts
 * and addressDedupe.test.ts, and batch add's guarantees are batchPrice.test.ts.
 */

// ─── The screen ───────────────────────────────────────────────────────────────

test("the screen fits 390px", async ({ page }) => {
  await stubScreen(page, [row(), row({ propertyId: "prop-2", address: "44 Oak Ave, Duluth, GA" })]);
  await page.goto("/properties");

  await expect(page.getByTestId("screen-row-prop-1")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);

  // Nothing on the card under the design system's 44px tap size.
  for (const id of ["finalist-prop-1", "checklist-prop-1", "resale-unchecked-prop-1"]) {
    const control = page.getByTestId(id);
    if ((await control.count()) === 0) continue;
    const box = await control.boundingBox();
    expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(44);
  }
  const pickBox = await page
    .getByTestId("screen-row-prop-1")
    .locator("label", { has: page.getByTestId("compare-pick-prop-1") })
    .boundingBox();
  expect(pickBox?.height ?? 0, "compare").toBeGreaterThanOrEqual(44);
});

test("a photo card shows the house, falls back without one, and opens it", async ({ page }) => {
  await stubScreen(page, [
    // No pipeline entry: the link is built from the property id, never the
    // entry, which is null for every house added since the pipeline went.
    { ...row({ propertyId: "prop-1", photoUrl: "https://photos.test/house.jpg", listingUrl: "https://zillow.com/x" }), entryId: null },
    row({ propertyId: "prop-2", address: "44 Oak Ave, Duluth, GA", photoUrl: "https://photos.test/dead.jpg" }),
  ]);
  // A one-pixel image for the live link; a 404 for the dead one.
  await page.route("https://photos.test/house.jpg", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64"),
    })
  );
  await page.route("https://photos.test/dead.jpg", (route) => route.fulfill({ status: 404 }));
  await page.goto("/properties");

  await expect(page.getByTestId("screen-photo-prop-1")).toBeVisible();
  // A dead link shows the band, not a broken image.
  await expect(page.getByTestId("screen-nophoto-prop-2")).toBeVisible();
  await expect(page.getByTestId("screen-photo-prop-2")).toHaveCount(0);

  // The listing opens the listing, in a new tab, not the house.
  const listing = page.getByTestId("screen-listing-prop-1");
  await expect(listing).toHaveAttribute("href", "https://zillow.com/x");
  await expect(listing).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("screen-open-prop-1")).toHaveAttribute("href", "/properties/prop-1");

  // The whole card is the target: tapping the photo, not the address, opens it.
  await tapCentre(page, "screen-photo-prop-1");
  await page.waitForURL("**/properties/prop-1");
});

// ─── The row and the map ──────────────────────────────────────────────────────

test("the row and the map point at the same house", async ({ page }) => {
  await stubScreen(page, [
    row({ propertyId: "a", address: "674 White Bird Way", listPrice: 135_000, latitude: 33.5668, longitude: -84.581 }),
    row({ propertyId: "b", address: "1900 Windsor Dr SW", listPrice: 100_000, latitude: 33.7095, longitude: -84.4352 }),
  ]);
  await page.goto("/properties");

  // The first card is chosen until something else is.
  await expect(page.getByTestId("screen-row-a")).toHaveAttribute("data-selected", "yes");

  // Tapping a pin chooses its house, brings its card into the row's view,
  // and keeps it chosen once the row has stopped moving. It used to flip
  // back to the first card when the row settled.
  await page.locator('.leaflet-marker-icon[title="$100k"] span').click();
  await expect(page.getByTestId("screen-row-b")).toHaveAttribute("data-selected", "yes");
  await expect
    .poll(() => page.getByTestId("screen-table").evaluate((row) => row.scrollLeft))
    .toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await expect(page.getByTestId("screen-row-b")).toHaveAttribute("data-selected", "yes");
  await expect(page.getByTestId("screen-row-a")).toHaveAttribute("data-selected", "no");

  // And scrolling the row back chooses the card that lands in the middle.
  await page.getByTestId("screen-table").evaluate((row) => row.scrollTo({ left: 0 }));
  await expect(page.getByTestId("screen-row-a")).toHaveAttribute("data-selected", "yes");
  await expect(page.locator('.leaflet-marker-icon[title="$135k"] span')).toHaveClass(
    /bg-\(--color-accent\)/
  );
});

// ─── Batch add ────────────────────────────────────────────────────────────────

const FIVE = [
  "128 Maple St, Duluth GA 30096, 250000",
  "44 Oak Ave, Duluth GA 30096, 265k",
  "1653 Sylvan Rd SW, Atlanta GA 30310",
  "3020 Fieldstone Way, Duluth GA 30096, $312,500",
  "58 Willow Bend Rd, Duluth GA 30096",
].join("\n");

async function stubBatch(page: Page, respond?: (text: string) => unknown) {
  await stubDataEndpoints(page);
  await page.route("**/api/properties/batch**", async (route) => {
    const sent = JSON.parse(route.request().postData() ?? "{}") as { text?: string };
    const lines = (sent.text ?? "").split("\n").filter((l) => l.trim());

    const body =
      respond?.(sent.text ?? "") ??
      {
        results: lines.map((raw, i) => ({
          lineNumber: i + 1,
          raw,
          status: "created",
          propertyId: `prop-${i + 1}`,
          matchedOn: "created",
          needsAddressReview: false,
          message: null,
        })),
        created: lines.length,
        matched: 0,
        failed: 0,
      };

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

test("pasting several addresses adds them, at 390px, and links on", async ({ page }) => {
  await stubBatch(page);
  await page.goto("/properties/new");

  // One house is the normal case; the paste box is behind "Add several". These
  // tests never pressed it, which is why all nine of them had been failing.
  await page.getByTestId("add-mode-several").click();
  await page.getByTestId("batch-addresses").fill(FIVE);
  // The button counts them, so you know what you are about to do.
  await expect(page.getByTestId("batch-submit")).toHaveText("Add 5 houses");

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);

  await page.getByTestId("batch-submit").click();

  await expect(page.getByTestId("batch-result")).toContainText("5 added");
  for (let line = 1; line <= 5; line++) {
    await expect(page.getByTestId(`batch-line-${line}`)).toBeVisible();
  }
  await expect(page.getByTestId("batch-to-screen")).toHaveAttribute("href", "/properties");
});
