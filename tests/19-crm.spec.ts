import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

/**
 * CRM phase 1.
 *
 * Runs at 390px throughout. The owner works this on a phone, and the pipeline
 * is one list precisely so it survives that width — a spec that only passes at
 * desktop would be testing a screen nobody uses.
 */
test.use({ viewport: { width: 390, height: 844 } });

// ─── Mock data ────────────────────────────────────────────────────────────────

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function entry(id: string, stage: string, stageSince: string) {
  return {
    id,
    owner_type: "personal",
    owner_id: "user-1",
    property_id: `prop-${id}`,
    stage,
    stage_since: stageSince,
    assigned_to: "user-1",
    source: "manual",
    created_by: "user-1",
    created_at: stageSince,
    updated_at: stageSince,
  };
}

function task(id: string, entryId: string, dueDate: string, title = "Follow up") {
  return {
    id,
    pipeline_entry_id: entryId,
    assigned_to: "user-1",
    title,
    due_date: dueDate,
    status: "open",
    auto_generated: true,
    cadence_step: 7,
    completed_at: null,
    completed_by: null,
    created_at: new Date().toISOString(),
  };
}

// Deliberately given to the page in the order the API would return them —
// already sorted, because the sort is server-side.
const ROWS = [
  {
    entry: entry("e1", "contacted", "2026-08-01T00:00:00Z"),
    addressLine1: "114 Peachtree St",
    city: "Atlanta",
    openTasks: [task("t1", "e1", isoDaysFromNow(-4))],
  },
  {
    entry: entry("e2", "contacted", "2026-09-01T00:00:00Z"),
    addressLine1: "220 Oak Ave",
    city: "Marietta",
    openTasks: [task("t2", "e2", isoDaysFromNow(0))],
  },
  {
    entry: entry("e3", "new_lead", "2026-06-01T00:00:00Z"),
    addressLine1: "9 Elm Ct",
    city: "Decatur",
    openTasks: [],
  },
];

const COUNTS = {
  new_lead: 1,
  contacted: 2,
  qualified: 0,
  offer: 0,
  under_contract: 0,
  closed: 3,
  dead: 1,
};

// ─── Pipeline list ────────────────────────────────────────────────────────────
//
// Removed with the screens. The pipeline was the same rows as Properties
// arranged by stage, and the owner had it taken out: "it's not useful for me".
// Its tests go with it rather than being kept green against nothing.
//
// The DATA is untouched — pipeline_entries still holds each house's stage and
// the house page still reads it, which the Property detail tests below cover.

// ─── Property detail ──────────────────────────────────────────────────────────

const DETAIL = {
  entry: entry("e1", "contacted", "2026-08-01T00:00:00Z"),
  property: {
    id: "prop-e1",
    address_line1: "114 Peachtree St",
    city: "Atlanta",
    county: "Fulton",
    state: "GA",
    zip: "30303",
    parcel_number: "14-0034-0001",
    property_type: "single_family",
    beds: 3,
    baths: 2,
    sqft: 1450,
    year_built: 1974,
    needs_address_review: false,
  },
  contacts: [
    {
      id: "c1",
      first_name: "Dana",
      last_name: "Whitfield",
      company: null,
      mailing_address_line1: null,
      mailing_city: null,
      mailing_state: null,
      mailing_zip: null,
      notes: null,
      relationship: "owner",
      isPrimary: true,
      phones: [
        {
          id: "p1",
          contact_id: "c1",
          number: "+14045550100",
          line_type: "mobile",
          status: "valid",
          suppression_reason: null,
          suppressed_at: null,
          suppressed_by: null,
          confidence: 90,
          source: "import",
          is_primary: true,
          created_at: new Date().toISOString(),
        },
        {
          id: "p2",
          contact_id: "c1",
          number: "+14045550199",
          line_type: "landline",
          status: "valid",
          suppression_reason: "seller_request",
          suppressed_at: new Date().toISOString(),
          suppressed_by: "user-1",
          confidence: 70,
          source: "import",
          is_primary: false,
          created_at: new Date().toISOString(),
        },
      ],
      emails: [],
    },
  ],
  tasks: [task("t1", "e1", isoDaysFromNow(-4))],
  activities: [
    {
      id: "a1",
      pipeline_entry_id: "e1",
      contact_id: "c1",
      user_id: "user-1",
      type: "call",
      direction: "outbound",
      outcome: "voicemail",
      body: "Left a voicemail.",
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ],
  history: [],
};

async function stubDetail(page: Page) {
  await stubDataEndpoints(page);

  const detail = (route: Parameters<Parameters<Page["route"]>[1]>[0]) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ detail: DETAIL }),
    });

  // The property page reads its detail from the property route now, not from
  // the CRM entry route. Both are stubbed: the entry route is still live for
  // other callers, and leaving only the old one here is what made this spec
  // render an empty page while the component waited on a request nobody
  // answered.
  await page.route("**/api/properties/**", detail);
  await page.route("**/api/crm/entry/**", detail);
}

test("a suppressed number stays visible, struck through, with its reason", async ({ page }) => {
  await stubDetail(page);
  await page.goto("/properties/e1");

  // Hiding it wouldn't suppress the call — it would move the lookup somewhere
  // nobody can flag it. So it's on screen, and it says why.
  const suppressed = page.getByTestId("suppressed-phone");
  await expect(suppressed).toBeVisible();
  await expect(suppressed).toContainText("+14045550199");
  await expect(page.getByText("Seller asked us to stop")).toBeVisible();

  // And it is not a tel link, while the clean number is.
  await expect(page.locator('a[href="tel:+14045550199"]')).toHaveCount(0);
  await expect(page.locator('a[href="tel:+14045550100"]')).toHaveCount(1);
});

test("detail shows the property, its contact and its activity at 390px", async ({ page }) => {
  await stubDetail(page);
  // The route moved to /properties/[id]; the old one redirects here.
  await page.goto("/properties/e1");

  await expect(page.getByRole("heading", { name: "114 Peachtree St" })).toBeVisible();

  // Contacts and activity now live on separate tabs rather than one long
  // scroll, so each is asserted where it actually is.
  await expect(page.getByText("Dana Whitfield")).toBeVisible();

  await page.getByTestId("tab-activity").click();
  await expect(page.getByText("Left a voicemail.")).toBeVisible();

  // Nothing overflows the phone. A horizontal scrollbar here means a card is
  // wider than the viewport, which is the failure mode this width is testing.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * The hub's one journey.
 *
 * What each tile SAYS is a Jest test against the wording functions — the hub
 * is a reader and the wording is all it can get wrong on its own. This proves
 * only what a browser can: the tiles render, and tapping one lands on the tab
 * that owns it.
 */
async function stubHub(page: Page) {
  await stubDetail(page);

  // After stubDetail so it wins: the screen endpoint lives under
  // /api/properties, which stubDetail's wildcard would otherwise answer with
  // a detail body, leaving every tile on its no-figures state.
  await page.route("**/api/properties/screen**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rows: [
          {
            propertyId: "prop-e1",
            entryId: "e1",
            address: "114 Peachtree St",
            needsAddressReview: false,
            price: 149_900,
            piti: 1_247,
            backDti: 34,
            cashToClose: 12_000,
            arv: null,
            maxOffer: 104_930,
            walkAwayCash: null,
            trueProfit: null,
            marginPct: null,
            affordability: {
              verdict: "tight",
              reasons: [],
              summary: "$1,915 left after closing",
              ratiosApply: true,
              needsProfile: false,
            },
            deal: {
              verdict: "does_not_work",
              reasons: [],
              summary: "No resale price yet",
              provisional: false,
              hasArv: false,
            },
            checklist: { numbers: true, comps: false, estimate: false, visit: false, done: 1 },
            explanations: {
              afford: { whatsWrong: "You'd have $1,915 left after closing.", target: "" },
              deal: { whatsWrong: "There is no resale price yet.", target: "" },
              arv: null,
            },
            approvedComps: 0,
            compsToReview: 72,
            isFinalist: false,
          },
        ],
      }),
    })
  );
}

test("the hub shows where the house stands and opens the tab behind a tile", async ({ page }) => {
  await stubHub(page);
  await page.goto("/properties/e1");

  await expect(page.getByTestId("hub-tile-arv")).toContainText("Not checked yet");
  await expect(page.getByTestId("hub-tile-arv")).toContainText("72 houses to go through");
  await expect(page.getByTestId("hub-tile-numbers")).toContainText("$1,247 a month");
  await expect(page.getByTestId("hub-tile-deal")).toContainText("No resale price yet");

  // The wiring: a tile is a way in, not a label.
  await page.getByTestId("hub-tile-arv").click();
  await expect(page.getByTestId("panel-comps")).toBeVisible();
});

test("the hub fits 390px", async ({ page }) => {
  await stubHub(page);
  await page.goto("/properties/e1");

  await expect(page.getByTestId("details-hub")).toBeVisible();

  // Four tiles two-up on a phone is exactly where this wraps badly.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});

