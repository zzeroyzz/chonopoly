import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

/**
 * Saved mortgage scenarios.
 *
 * At 390px, like the rest of the calculator — the owner works this on a phone.
 *
 * The scenario API is stubbed rather than hit for real. These tests are about
 * the round trip the user sees: name it, see it listed, open it and get the
 * numbers back. Writing to the live table would leave rows behind and make the
 * suite depend on what is already saved.
 */
test.use({ viewport: { width: 390, height: 844 } });

interface StoredProperty {
  id: string;
  addressLine1: string;
  city: string | null;
  state: string;
  zip: string | null;
  needsAddressReview: boolean;
}

interface StoredScenario {
  id: string;
  property: StoredProperty | null;
  label: string;
  home_value: number;
  loan_type: string;
  monthly_payment: number;
  version: number;
  updated_at: string;
  inputs: Record<string, unknown>;
}

/**
 * A stand-in for the table, so save → list → load behaves as it would against
 * the database without touching it.
 */
async function stubScenarioApi(
  page: Page,
  seed: StoredScenario[] = [],
  /** Houses that already exist, which is the only thing the picker can offer. */
  houses: StoredProperty[] = []
) {
  const store: StoredScenario[] = [...seed];
  const properties: StoredProperty[] = [
    ...seed.map((s) => s.property).filter((p): p is StoredProperty => !!p),
    ...houses,
  ];

  // What the "Save to a house" picker lists. Houses come from Add; this only
  // reads them.
  await page.route("**/api/properties/screen**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rows: properties.map((p) => ({
          propertyId: p.id,
          address: [p.addressLine1, p.city, p.state].filter(Boolean).join(", "),
        })),
      }),
    })
  );

  // The real route maps rows to camelCase before returning them. The stub has
  // to do the same or it is testing a contract the app does not have.
  const asSummary = (s: StoredScenario) => ({
    id: s.id,
    property: s.property,
    label: s.label,
    homeValue: s.home_value,
    loanType: s.loan_type,
    monthlyPayment: s.monthly_payment,
    version: s.version,
    updatedAt: s.updated_at,
  });

  await page.route("**/api/mortgage/scenarios?**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scenarios: store.map(asSummary) }),
    });
  });

  await page.route("**/api/mortgage/scenarios", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as {
      label: string;
      inputs: Record<string, unknown>;
      monthly_payment: number;
    };

    // A save names an existing house by id, or no house at all. There is no
    // address in the payload any more, so nothing here can create a property —
    // which is the point: two spellings of one address made two houses.
    let property: StoredProperty | null = null;
    let matchedOn: "parcel" | "address" | "created" | undefined;
    const propertyId = (body as { property_id?: string }).property_id;
    if (propertyId) {
      property = properties.find((p) => p.id === propertyId) ?? null;
      if (!property) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: '{"error":"Property not found"}',
        });
      }
    }
    // An address alongside a property id is a caller bug the route rejects.
    if ((body as { address?: unknown }).address) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: '{"error":"Send property_id or address, not both"}',
      });
    }

    // Same name on the same house is an update, not a second row.
    const existing = store.find(
      (s) =>
        s.label.toLowerCase() === body.label.toLowerCase() &&
        (s.property?.id ?? null) === (property?.id ?? null)
    );
    if (existing) {
      existing.version += 1;
      existing.inputs = body.inputs;
      existing.monthly_payment = body.monthly_payment;
      existing.home_value = body.inputs.homeValue as number;
    } else {
      store.push({
        id: `s-${store.length + 1}`,
        property,
        label: body.label,
        home_value: body.inputs.homeValue as number,
        loan_type: body.inputs.loanType as string,
        monthly_payment: body.monthly_payment,
        version: 1,
        updated_at: new Date().toISOString(),
        inputs: body.inputs,
      });
    }

    const saved = store[store.length - 1];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scenario: asSummary(existing ?? saved), matchedOn }),
    });
  });

  await page.route("**/api/mortgage/scenarios/*/address", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").slice(-2)[0];
    // Attaching names an existing house by id; it never creates one. This stub
    // used to accept a typed address and make a house, which the real route
    // stopped doing — so the old test could not find the field it typed into.
    const body = route.request().postDataJSON() as { property_id: string };
    const target = store.find((s) => s.id === id);
    const property = properties.find((p) => p.id === body.property_id);
    if (!target || !property) {
      return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"Not found"}' });
    }
    target.property = property;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ scenario: asSummary(target), matchedOn: "attached" }),
    });
  });

  await page.route("**/api/mortgage/scenarios/*?**", async (route) => {
    const method = route.request().method();
    const id = new URL(route.request().url()).pathname.split("/").pop();

    if (method === "DELETE") {
      const i = store.findIndex((s) => s.id === id);
      if (i >= 0) store.splice(i, 1);
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }

    const found = store.find((s) => s.id === id);
    await route.fulfill({
      status: found ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(
        found
          ? { scenario: { ...asSummary(found), inputs: found.inputs } }
          : { error: "Scenario not found" }
      ),
    });
  });
}

async function openCalculator(page: Page) {
  await stubDataEndpoints(page);
  await page.addInitScript(() => window.localStorage.removeItem("mortgageCalculatorInputs"));
  await page.goto("/mortgage");
  await expect(page.getByText("Saved scenarios")).toBeVisible();
}

const priceField = (page: Page) => page.locator('input:not([type="checkbox"])').first();
const nameField = (page: Page) => page.getByLabel("Scenario name");

/** The house the picker will offer in these tests. */
const MAPLE = {
  id: "prop-maple",
  addressLine1: "128 Maple St",
  city: null,
  state: "GA",
  zip: null,
  needsAddressReview: false,
};

/*
 * What moved to Jest (tests/unit/groupScenarios.test.ts, scenarios.test.ts):
 * the save button's whitespace rule, grouping by house, Unassigned, and that
 * re-saving a name updates rather than adds a row.
 */

test("save a scenario, see it listed, reopen it, delete it", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  await priceField(page).fill("412000");
  await priceField(page).blur();
  await nameField(page).fill("Oak Ave");
  await page.getByTestId("scenario-save").click();

  await expect(page.getByText("Oak Ave")).toBeVisible();
  await expect(page.getByText(/\$412,000 · \$[\d,]+\/mo/)).toBeVisible();
  // The name field clears, so the next save does not silently overwrite.
  await expect(nameField(page)).toHaveValue("");

  // Move away from the saved numbers, then load them back.
  await priceField(page).fill("199000");
  await priceField(page).blur();
  await page.getByText("Oak Ave").click();
  await expect(priceField(page)).toHaveValue("412000");

  await page.getByRole("button", { name: /Delete Oak Ave/i }).click();
  await expect(page.getByText("Oak Ave")).toHaveCount(0);
});

test("an Unassigned save can be attached to a house", async ({ page }) => {
  await stubScenarioApi(
    page,
    [
      {
        id: "s-1",
        property: null,
        label: "128 Maple St",
        home_value: 250_000,
        loan_type: "fha",
        monthly_payment: 2_221,
        version: 1,
        updated_at: new Date().toISOString(),
        inputs: { homeValue: 250_000, loanType: "fha" },
      },
    ],
    [MAPLE]
  );
  await openCalculator(page);
  await expect(page.getByText("Unassigned")).toBeVisible();

  await page.getByTestId("attach-s-1").click();
  // Pre-filled from the label, so the house it was named after is offered.
  await expect(page.getByTestId("attach-house-search")).toHaveValue("128 Maple St");
  await page.getByTestId(`attach-house-${MAPLE.id}`).click();

  await expect(page.getByText("Unassigned")).toHaveCount(0);
  await expect(page.getByRole("paragraph").filter({ hasText: /^128 Maple St$/ })).toBeVisible();
});

test("the grouped list fits 390px", async ({ page }) => {
  const sylvan = { ...MAPLE, id: "prop-sylvan", addressLine1: "1653 Sylvan Rd SW", city: "Atlanta" };
  await stubScenarioApi(page, [], [sylvan]);
  await openCalculator(page);

  await page.getByTestId("scenario-pick-house").click();
  await page.getByTestId(`scenario-house-${sylvan.id}`).click();
  await nameField(page).fill("A name long enough to test truncation on a narrow screen");
  await page.getByTestId("scenario-save").click();
  await expect(page.getByText(/A name long enough/)).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});
