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

async function stubPipeline(page: Page) {
  await stubDataEndpoints(page);
  await page.route("**/api/crm/pipeline**", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rows: ROWS, counts: COUNTS }),
    });
  });
}

// ─── Pipeline list ────────────────────────────────────────────────────────────

test("pipeline renders one list at 390px with no column to pick first", async ({ page }) => {
  await stubPipeline(page);
  await page.goto("/crm");

  const rows = page.getByTestId("pipeline-row");
  await expect(rows).toHaveCount(3);

  // Every lead is visible without selecting a stage. That's the whole argument
  // against the board: nothing is behind a choice.
  await expect(page.getByText("114 Peachtree St")).toBeVisible();
  await expect(page.getByText("220 Oak Ave")).toBeVisible();
  await expect(page.getByText("9 Elm Ct")).toBeVisible();
});

test("the order the API returns is the order rendered — overdue first", async ({ page }) => {
  await stubPipeline(page);
  await page.goto("/crm");

  const rows = page.getByTestId("pipeline-row");
  await expect(rows.nth(0)).toContainText("114 Peachtree St");
  await expect(rows.nth(1)).toContainText("220 Oak Ave");
  await expect(rows.nth(2)).toContainText("9 Elm Ct");
});

test("an overdue task and a lead with no follow-up both say so", async ({ page }) => {
  await stubPipeline(page);
  await page.goto("/crm");

  await expect(page.getByText("Overdue —")).toBeVisible();
  // A lead nobody is chasing is a defect, not a quiet success.
  await expect(page.getByText("No follow-up")).toBeVisible();
});

test("stage changes from a menu on the row, and every stage is one tap away", async ({ page }) => {
  await stubPipeline(page);

  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/crm/stage**", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entry: entry("e1", "dead", new Date().toISOString()) }),
    });
  });

  await page.goto("/crm");
  await page.getByTestId("stage-badge").first().click();
  await expect(page.getByTestId("stage-menu")).toBeVisible();

  // Including the two moves a swipe can't express: straight to dead, and back.
  await expect(page.getByTestId("stage-option-dead")).toBeVisible();
  await expect(page.getByTestId("stage-option-new_lead")).toBeVisible();

  await page.getByTestId("stage-option-dead").click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted).toMatchObject({ entry_id: "e1", to_stage: "dead" });
});

test("closed and dead are hidden until asked for", async ({ page }) => {
  await stubPipeline(page);
  await page.goto("/crm");

  const toggle = page.getByTestId("toggle-terminal");
  await expect(toggle).toHaveText("Show closed & dead");
  await toggle.click();
  await expect(toggle).toHaveText("Hide closed & dead");
});

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
  await page.route("**/api/crm/entry/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ detail: DETAIL }),
    })
  );
}

test("a suppressed number stays visible, struck through, with its reason", async ({ page }) => {
  await stubDetail(page);
  await page.goto("/crm/e1");

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
  await page.goto("/crm/e1");

  await expect(page.getByRole("heading", { name: "114 Peachtree St" })).toBeVisible();
  await expect(page.getByText("Dana Whitfield")).toBeVisible();
  await expect(page.getByText("Left a voicemail.")).toBeVisible();

  // Nothing overflows the phone. A horizontal scrollbar here means a card is
  // wider than the viewport, which is the failure mode this width is testing.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

test("dashboard lists stage counts and the no-follow-up defects", async ({ page }) => {
  await stubPipeline(page);
  await page.goto("/crm/dashboard");

  await expect(page.getByText("By stage")).toBeVisible();
  // e3 is active with zero open tasks — the one defect in the fixture.
  const defects = page.getByTestId("defect-row");
  await expect(defects).toHaveCount(1);
  await expect(defects.first()).toContainText("9 Elm Ct");
});
