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
  };
}

async function stubScreen(page: Page, rows: unknown[]) {
  await stubDataEndpoints(page);
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

// ─── The screen table ─────────────────────────────────────────────────────────

test("the screen shows both verdicts for a house", async ({ page }) => {
  await stubScreen(page, [row()]);
  await page.goto("/properties");

  await expect(page.getByTestId("verdict-afford-prop-1")).toHaveText("Qualifies");
  await expect(page.getByTestId("verdict-deal-prop-1")).toHaveText("Works");
});

test("each verdict carries its reason", async ({ page }) => {
  await stubScreen(page, [
    row({
      affordability: "does_not_qualify",
      affordabilitySummary: "Needs $42,000 at closing, $12,000 available",
      deal: "thin",
      dealSummary: "11% margin is under the 15% target",
    }),
  ]);
  await page.goto("/properties");

  // A bare verdict on a screen of fifteen houses is not actionable.
  const reason = page.getByTestId("verdict-reason-prop-1");
  await expect(reason).toContainText("Needs $42,000 at closing, $12,000 available");
  await expect(reason).toContainText("11% margin is under the 15% target");
});

// Was "the figures that drive the verdicts are on the row". The eight-figure
// grid left the card in plans/properties-design-change.md (option A, owner
// approved 2026-10-23); the figures live on the house page and Compare.
test("the card leads with the asking price, address and specs", async ({ page }) => {
  await stubScreen(page, [row()]);
  await page.goto("/properties");

  await expect(page.getByTestId("screen-price-prop-1")).toHaveText("$250,000");
  await expect(page.getByTestId("screen-open-prop-1")).toHaveText("128 Maple St, Duluth, GA, 30096");
  await expect(page.getByTestId("screen-specs-prop-1")).toHaveText("3 bed · 2 bath · 1,750 sq ft");
});

test("a house with no asking price says so instead of a default", async ({ page }) => {
  await stubScreen(page, [row({ listPrice: null })]);
  await page.goto("/properties");

  // `price` is still 250,000 in the stub, as the calculator default would be.
  // The card must not present it as the house's price.
  await expect(page.getByTestId("screen-price-prop-1")).toHaveText("No asking price yet");
});

test("a house with no ARV says so instead of showing a verdict", async ({ page }) => {
  await stubScreen(page, [row({ hasArv: false, arv: null, profit: null })]);
  await page.goto("/properties");

  // Was "No ARV". Changed because the interface stopped saying it, not
  // because the test went red: ARV is banned from user-facing text and a
  // verdict has to say what to do about itself. One definition now, in
  // NO_RESALE_PRICE_LABEL, shared by this list, the house page and compare.
  await expect(page.getByTestId("verdict-deal-prop-1")).toHaveText("No resale price yet");
  // The figures grid with its dashes left the card; what is missing is said
  // in words, with the way to fix it.
  await expect(page.getByTestId("resale-unchecked-prop-1")).toBeVisible();
});

test("a house with nothing approved asks for a review", async ({ page }) => {
  await stubScreen(page, [row({ arv: null, approvedComps: 0, compsToReview: 12 })]);
  await page.goto("/properties");

  // Was a "Review comps" tag. The design system keeps ARV and comp out of
  // the interface, so it is said in plain words and links to the review.
  const check = page.getByTestId("resale-unchecked-prop-1");
  await expect(check).toHaveText("Resale price not checked yet →");
  await expect(check).toHaveAttribute("href", "/properties/prop-1?tab=arv");
});

// Was "an approved ARV says what it rests on" — the "ARV … · 4 approved" tag
// is gone. A checked price says nothing on the card: the verdict rests on it.
test("a checked resale price does not ask for a review", async ({ page }) => {
  await stubScreen(page, [row({ arv: 320_000, approvedComps: 4, compsToReview: 8 })]);
  await page.goto("/properties");

  await expect(page.getByTestId("screen-row-prop-1")).toBeVisible();
  await expect(page.getByTestId("resale-unchecked-prop-1")).toHaveCount(0);
});

test("no income on file asks for it rather than judging", async ({ page }) => {
  await stubScreen(page, [
    row({ needsProfile: true, affordability: "tight", affordabilitySummary: "Set your income" }),
  ]);
  await page.goto("/properties");

  await expect(page.getByTestId("verdict-afford-prop-1")).toHaveText("Set your income");
});

test("an address flagged for review says so on the row", async ({ page }) => {
  await stubScreen(page, [row({ needsAddressReview: true })]);
  await page.goto("/properties");

  await expect(page.getByTestId("screen-review-prop-1")).toContainText("needs a check");
});

test("a listing link is one tap from the row", async ({ page }) => {
  await stubScreen(page, [row({ listingUrl: "https://zillow.com/x" })]);
  await page.goto("/properties");

  const link = page.getByTestId("screen-listing-prop-1");
  await expect(link).toHaveAttribute("href", "https://zillow.com/x");
  await expect(link).toHaveAttribute("target", "_blank");
});

// ─── The progress checklist ───────────────────────────────────────────────────

// The four step buttons became one count that opens the next step. The old
// test named visit / estimate / comps steps the card had already stopped
// showing, and was failing on main before this change.
test("the steps count opens the next step still to do", async ({ page }) => {
  // Details is always done and Numbers is done here; the resale price and the
  // deal are not.
  await stubScreen(page, [row({ arv: null, walkAwayCash: null })]);
  await page.goto("/properties");

  const steps = page.getByTestId("checklist-prop-1");
  await expect(steps).toHaveText("2 of 4 steps done");
  await expect(steps).toHaveAttribute("href", "/properties/prop-1?tab=arv");
});

test("a finished house shows four of four", async ({ page }) => {
  await stubScreen(page, [row()]);
  await page.goto("/properties");

  const steps = page.getByTestId("checklist-prop-1");
  await expect(steps).toHaveText("4 of 4 steps done");
  await expect(steps).toHaveAttribute("href", "/properties/prop-1?tab=deal");
});

// ─── Ordering and empties ─────────────────────────────────────────────────────

test("the server's order is preserved", async ({ page }) => {
  // The sort lives server-side so every client agrees; the table must not
  // reorder it.
  await stubScreen(page, [
    row({ propertyId: "a", address: "1 First St", deal: "works" }),
    row({ propertyId: "b", address: "2 Second St", deal: "thin" }),
    row({ propertyId: "c", address: "3 Third St", deal: "does_not_work" }),
  ]);
  await page.goto("/properties");

  // evaluateAll does not auto-wait, so wait for the list to render first.
  const items = page.getByTestId("screen-table").locator("li");
  await expect(items).toHaveCount(3);

  const ids = await items.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-testid")));
  expect(ids).toEqual(["screen-row-a", "screen-row-b", "screen-row-c"]);
});

test("an empty screen points at adding houses", async ({ page }) => {
  await stubScreen(page, []);
  await page.goto("/properties");

  await expect(page.getByTestId("screen-empty")).toContainText("No houses yet");
  await expect(page.getByRole("link", { name: "Add a house" })).toHaveAttribute(
    "href",
    "/properties/new"
  );
});

test("a filter showing nothing offers a way back", async ({ page }) => {
  await stubScreen(page, [row()]);
  await page.goto("/properties");

  await page.getByTestId("filter-finalists").click();
  await expect(page.getByTestId("screen-filter-empty")).toContainText("No finalists yet");

  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page.getByTestId("screen-row-prop-1")).toBeVisible();
});

test("a failed load says why", async ({ page }) => {
  await stubDataEndpoints(page);
  await page.route("**/api/properties/screen**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "column analyses.home_value does not exist" }),
    })
  );
  await page.goto("/properties");

  // The server's message, not a parser complaint.
  await expect(page.getByTestId("screen-error")).toContainText("analyses.home_value");
});

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
    row({ propertyId: "prop-1", photoUrl: "https://photos.test/house.jpg" }),
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

  // Tapping the photo itself, not the address, opens the house.
  await tapCentre(page, "screen-photo-prop-1");
  await page.waitForURL("**/properties/prop-1");
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

test("pasting five addresses adds five houses", async ({ page }) => {
  await stubBatch(page);
  await page.goto("/properties/new");

  await page.getByTestId("batch-addresses").fill(FIVE);
  // The button counts them, so you know what you are about to do.
  await expect(page.getByTestId("batch-submit")).toHaveText("Add 5 houses");

  await page.getByTestId("batch-submit").click();

  await expect(page.getByTestId("batch-result")).toContainText("5 added");
  for (let line = 1; line <= 5; line++) {
    await expect(page.getByTestId(`batch-line-${line}`)).toBeVisible();
  }
});

test("one address reads as one house", async ({ page }) => {
  await stubBatch(page);
  await page.goto("/properties/new");

  await page.getByTestId("batch-addresses").fill("128 Maple St, Duluth GA 30096");
  await expect(page.getByTestId("batch-submit")).toHaveText("Add house");
});

test("a bad line is named and the rest still go through", async ({ page }) => {
  await stubBatch(page, () => ({
    results: [
      { lineNumber: 1, raw: "128 Maple St", status: "created", propertyId: "p1", matchedOn: "created", needsAddressReview: false, message: null },
      { lineNumber: 2, raw: "not an address", status: "failed", propertyId: null, matchedOn: null, needsAddressReview: false, message: "Doesn't start with a street number" },
      { lineNumber: 3, raw: "44 Oak Ave", status: "created", propertyId: "p3", matchedOn: "created", needsAddressReview: false, message: null },
    ],
    created: 2,
    matched: 0,
    failed: 1,
  }));
  await page.goto("/properties/new");

  await page.getByTestId("batch-addresses").fill("128 Maple St\nnot an address\n44 Oak Ave");
  await page.getByTestId("batch-submit").click();

  await expect(page.getByTestId("batch-result")).toContainText("2 added");
  await expect(page.getByTestId("batch-result")).toContainText("1 skipped");

  // The reason, keyed to the line the user can see.
  const bad = page.getByTestId("batch-line-2");
  await expect(bad).toContainText("Line 2");
  await expect(bad).toContainText("street number");
});

test("a probable address match is flagged rather than merged silently", async ({ page }) => {
  await stubBatch(page, () => ({
    results: [
      {
        lineNumber: 1,
        raw: "1653 sylvan rd sw, Atlanta GA 30310",
        status: "matched",
        propertyId: "p1",
        matchedOn: "address",
        needsAddressReview: true,
        message: "Probable match to an existing house — flagged for review",
      },
    ],
    created: 0,
    matched: 1,
    failed: 0,
  }));
  await page.goto("/properties/new");

  await page.getByTestId("batch-addresses").fill("1653 sylvan rd sw, Atlanta GA 30310");
  await page.getByTestId("batch-submit").click();

  await expect(page.getByTestId("batch-result")).toContainText("already known");
  await expect(page.getByTestId("batch-line-1")).toContainText("Probable match");
  await expect(page.getByTestId("batch-line-1")).toContainText("needs a check");
});

test("batch add does not call RentCast", async ({ page }) => {
  await stubBatch(page);

  let rentcastCalls = 0;
  page.on("request", (req) => {
    if (/comps\/refresh|rentcast/.test(req.url()) && req.method() === "POST") rentcastCalls += 1;
  });

  await page.goto("/properties/new");
  await page.getByTestId("batch-addresses").fill(FIVE);
  await page.getByTestId("batch-submit").click();
  await expect(page.getByTestId("batch-result")).toBeVisible();

  // Five houses would have spent five of the month's fifty requests before
  // anyone decided which were worth it.
  expect(rentcastCalls).toBe(0);
  await expect(page.getByText("Comps are pulled per house")).toBeVisible();
});

test("the result links on to the screen", async ({ page }) => {
  await stubBatch(page);
  await page.goto("/properties/new");

  await page.getByTestId("batch-addresses").fill(FIVE);
  await page.getByTestId("batch-submit").click();

  const link = page.getByTestId("batch-to-screen");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/properties");
});

test("submit is disabled with nothing pasted", async ({ page }) => {
  await stubBatch(page);
  await page.goto("/properties/new");

  await expect(page.getByTestId("batch-submit")).toBeDisabled();
});

test("a failed batch says why and keeps the text", async ({ page }) => {
  await stubDataEndpoints(page);
  await page.route("**/api/properties/batch**", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "That's 140 addresses. The limit is 100 at a time." }),
    })
  );
  await page.goto("/properties/new");

  await page.getByTestId("batch-addresses").fill(FIVE);
  await page.getByTestId("batch-submit").click();

  await expect(page.getByTestId("batch-error")).toContainText("limit is 100");
  // The paste is not thrown away on a failure.
  await expect(page.getByTestId("batch-addresses")).not.toHaveValue("");
});

test("the add screen fits 390px", async ({ page }) => {
  await stubBatch(page);
  await page.goto("/properties/new");

  await page.getByTestId("batch-addresses").fill(FIVE);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

// ─── Opening a house from the screen ──────────────────────────────────────────

test("a row links to its property, not its pipeline entry", async ({ page }) => {
  await stubScreen(page, [row({ propertyId: "prop-1" })]);
  await page.goto("/properties");

  // It used to link by entry id and fall back to "/properties" — the page you
  // are already on — when the house had no entry. Since neither the calculator
  // save nor a batch paste creates an entry, that was every house.
  await expect(page.getByTestId("screen-open-prop-1")).toHaveAttribute(
    "href",
    "/properties/prop-1"
  );
});

test("the whole card is clickable, not just the address", async ({ page }) => {
  await stubScreen(page, [row({ propertyId: "prop-1" })]);
  await page.goto("/properties");

  // At 390px a single line of text is a thin thing to hit. The old version
  // asserted figures inside the link text, which stopped being true before
  // this redesign and was failing on main; this taps the price instead.
  await tapCentre(page, "screen-price-prop-1");
  await page.waitForURL("**/properties/prop-1");
});

test("a house with no pipeline entry still opens", async ({ page }) => {
  // The case that was broken: entryId null.
  await stubScreen(page, [{ ...row({ propertyId: "prop-1" }), entryId: null }]);
  await page.goto("/properties");

  await expect(page.getByTestId("screen-open-prop-1")).toHaveAttribute(
    "href",
    "/properties/prop-1"
  );
});

test("the listing link opens the listing, not the property", async ({ page }) => {
  await stubScreen(page, [row({ propertyId: "prop-1", listingUrl: "https://zillow.com/x" })]);
  await page.goto("/properties");

  // It sits inside the card-wide link, so its click must not bubble.
  const listing = page.getByTestId("screen-listing-prop-1");
  await expect(listing).toHaveAttribute("href", "https://zillow.com/x");
  await expect(listing).toHaveAttribute("target", "_blank");
});
