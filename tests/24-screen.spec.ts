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
  provisionalArv?: boolean;
  checklist?: Partial<{ numbers: boolean; comps: boolean; estimate: boolean; visit: boolean }>;
  needsAddressReview?: boolean;
  listingUrl?: string | null;
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
      provisional: overrides.provisionalArv ?? false,
      hasArv: overrides.hasArv ?? true,
    },
    checklist: {
      ...checklist,
      done: [checklist.numbers, checklist.comps, checklist.estimate, checklist.visit].filter(Boolean)
        .length,
    },
    provisionalArv: overrides.provisionalArv ?? false,
    listingUrl: overrides.listingUrl ?? null,
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

test("the figures that drive the verdicts are on the row", async ({ page }) => {
  await stubScreen(page, [row()]);
  await page.goto("/properties");

  const card = page.getByTestId("screen-row-prop-1");
  await expect(card).toContainText("$250,000");
  await expect(card).toContainText("$2,221/mo");
  await expect(card).toContainText("34%");
  await expect(card).toContainText("$18,500");
  await expect(card).toContainText("$359,375");
});

test("a house with no ARV says so instead of showing a verdict", async ({ page }) => {
  await stubScreen(page, [row({ hasArv: false, arv: null, profit: null })]);
  await page.goto("/properties");

  await expect(page.getByTestId("verdict-deal-prop-1")).toHaveText("No ARV");
  // Not a dash that could be mistaken for zero.
  await expect(page.getByTestId("screen-row-prop-1")).toContainText("—");
});

test("an unreviewed ARV is labelled", async ({ page }) => {
  await stubScreen(page, [row({ provisionalArv: true })]);
  await page.goto("/properties");

  // Every comp RentCast returned is included until someone reviews them, so
  // the verdict is real but provisional.
  await expect(page.getByTestId("verdict-provisional-prop-1")).toHaveText("Unreviewed");
});

test("a reviewed ARV carries no label", async ({ page }) => {
  await stubScreen(page, [row({ provisionalArv: false })]);
  await page.goto("/properties");

  await expect(page.getByTestId("verdict-provisional-prop-1")).toHaveCount(0);
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

test("the checklist shows all four steps and which are done", async ({ page }) => {
  await stubScreen(page, [
    row({ checklist: { numbers: true, comps: true, estimate: false, visit: false } }),
  ]);
  await page.goto("/properties");

  await expect(page.getByTestId("checklist-numbers-prop-1")).toHaveAttribute("data-done", "yes");
  await expect(page.getByTestId("checklist-comps-prop-1")).toHaveAttribute("data-done", "yes");
  await expect(page.getByTestId("checklist-estimate-prop-1")).toHaveAttribute("data-done", "no");
  await expect(page.getByTestId("checklist-visit-prop-1")).toHaveAttribute("data-done", "no");
  await expect(page.getByTestId("checklist-prop-1")).toContainText("2/4");
});

test("a finished house shows four of four", async ({ page }) => {
  await stubScreen(page, [
    row({ checklist: { numbers: true, comps: true, estimate: true, visit: true } }),
  ]);
  await page.goto("/properties");

  await expect(page.getByTestId("checklist-prop-1")).toContainText("4/4");
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
  await expect(page.getByRole("link", { name: /Add some addresses/ })).toBeVisible();
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
