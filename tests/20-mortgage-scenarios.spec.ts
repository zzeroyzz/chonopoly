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
async function stubScenarioApi(page: Page, seed: StoredScenario[] = []) {
  const store: StoredScenario[] = [...seed];
  const properties: StoredProperty[] = seed.map((s) => s.property).filter((p): p is StoredProperty => !!p);

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

    // Mirrors upsertProperty: one property per normalised address, so saving
    // twice at one address yields one house and two analyses.
    let property: StoredProperty | null = null;
    let matchedOn: "parcel" | "address" | "created" | undefined;
    const line1 = (body as { address?: { address_line1?: string } }).address?.address_line1;
    if (line1) {
      const key = line1.trim().toLowerCase();
      const found = properties.find((p) => p.addressLine1.trim().toLowerCase() === key);
      if (found) {
        property = found;
        matchedOn = "address";
        found.needsAddressReview = true;
      } else {
        property = {
          id: `prop-${properties.length + 1}`,
          addressLine1: line1.trim(),
          city: null, state: "GA", zip: null, needsAddressReview: false,
        };
        properties.push(property);
        matchedOn = "created";
      }
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
    const body = route.request().postDataJSON() as { address_line1: string };
    const target = store.find((s) => s.id === id);
    if (!target) {
      return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"Scenario not found"}' });
    }
    const property: StoredProperty = {
      id: `prop-${properties.length + 1}`,
      addressLine1: body.address_line1.trim(),
      city: null, state: "GA", zip: null, needsAddressReview: false,
    };
    properties.push(property);
    target.property = property;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ scenario: asSummary(target), matchedOn: "created" }),
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

test("the save control is on the page with nothing saved yet", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  await expect(nameField(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /save/i })).toBeDisabled();
  await expect(page.getByText(/Save the current numbers under a name/)).toBeVisible();
});

test("save is disabled until the scenario has a name", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  const save = page.getByRole("button", { name: /save/i });
  await expect(save).toBeDisabled();

  await nameField(page).fill("Maple St");
  await expect(save).toBeEnabled();

  // Whitespace is not a name.
  await nameField(page).fill("   ");
  await expect(save).toBeDisabled();
});

test("saving a scenario lists it with its price and payment", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  await priceField(page).fill("250000");
  await priceField(page).blur();

  await nameField(page).fill("Maple St");
  await page.getByRole("button", { name: /save/i }).click();

  await expect(page.getByText("Maple St")).toBeVisible();
  await expect(page.getByText(/\$250,000 · \$[\d,]+\/mo/)).toBeVisible();
  // The name field clears, so the next save does not silently overwrite.
  await expect(nameField(page)).toHaveValue("");
});

test("opening a saved scenario puts its numbers back in the form", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  await priceField(page).fill("412000");
  await priceField(page).blur();
  await nameField(page).fill("Oak Ave");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText("Oak Ave")).toBeVisible();

  // Move away from the saved numbers, then load them back.
  await priceField(page).fill("199000");
  await priceField(page).blur();
  await expect(priceField(page)).toHaveValue("199000");

  await page.getByText("Oak Ave").click();
  await expect(priceField(page)).toHaveValue("412000");
});

test("saving again under the same name keeps one row and bumps the version", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  await priceField(page).fill("250000");
  await priceField(page).blur();
  await nameField(page).fill("Maple St");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText("Maple St")).toBeVisible();

  await priceField(page).fill("265000");
  await priceField(page).blur();
  await nameField(page).fill("Maple St");
  await page.getByRole("button", { name: /save/i }).click();

  // One row, not two that look identical in the list.
  await expect(page.getByText("Maple St")).toHaveCount(1);
  await expect(page.getByText(/v2/)).toBeVisible();
  // And the history control appears once there is something to see.
  await expect(page.getByRole("button", { name: /History for Maple St/i })).toBeVisible();
});

test("deleting a scenario removes it from the list", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  await nameField(page).fill("Scratch");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText("Scratch")).toBeVisible();

  await page.getByRole("button", { name: /Delete Scratch/i }).click();
  await expect(page.getByText("Scratch")).toHaveCount(0);
});

test("the saved list fits 390px without horizontal overflow", async ({ page }) => {
  await stubScenarioApi(page, [
    {
      id: "s-1",
      property: null,
      label: "A name long enough to test truncation on a narrow screen",
      home_value: 250_000,
      loan_type: "fha",
      monthly_payment: 2_221,
      version: 3,
      updated_at: new Date().toISOString(),
      inputs: { homeValue: 250_000, loanType: "fha" },
    },
  ]);
  await openCalculator(page);

  await expect(page.getByText(/A name long enough/)).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

// ─── The property spine ───────────────────────────────────────────────────────

test("saving with an address groups the scenario under that house", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  await page.getByTestId("scenario-address").fill("128 Maple St");
  await nameField(page).fill("at asking");
  await page.getByRole("button", { name: /save/i }).click();

  // Scoped to the group heading: the match note names the address too, so a
  // bare text match is ambiguous and only passes by timing luck.
  await expect(page.getByRole("paragraph").filter({ hasText: /^128 Maple St$/ })).toBeVisible();
  await expect(page.getByText("at asking")).toBeVisible();
  await expect(page.getByTestId("match-note")).toContainText("Added 128 Maple St");
});

test("two scenarios on one address give one house and two rows", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  for (const label of ["at asking", "at $240k"]) {
    await page.getByTestId("scenario-address").fill("128 Maple St");
    await nameField(page).fill(label);
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText(label)).toBeVisible();
  }

  // One heading, two scenarios under it. Scoped to the heading: the match note
  // names the address too, so a bare text match finds both.
  await expect(page.getByRole("paragraph").filter({ hasText: /^128 Maple St$/ })).toHaveCount(1);
  await expect(page.getByText("at asking")).toBeVisible();
  await expect(page.getByText("at $240k")).toBeVisible();
});

test("a second save at the same address is flagged for review", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  await page.getByTestId("scenario-address").fill("128 Maple St");
  await nameField(page).fill("at asking");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText("at asking")).toBeVisible();

  await page.getByTestId("scenario-address").fill("128 Maple St");
  await nameField(page).fill("with 10% down");
  await page.getByRole("button", { name: /save/i }).click();

  // Normalisation is lossy, so an address match says so rather than implying
  // certainty.
  await expect(page.getByTestId("match-note")).toContainText("check it before working it");
  await expect(page.getByTestId("needs-review")).toBeVisible();
});

test("a save with no address lands under Unassigned", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  await nameField(page).fill("quick math");
  await page.getByRole("button", { name: /save/i }).click();

  await expect(page.getByText("Unassigned")).toBeVisible();
  await expect(page.getByText("quick math")).toBeVisible();
});

test("an Unassigned save can have an address attached", async ({ page }) => {
  await stubScenarioApi(page, [
    {
      id: "s-1",
      property: null,
      label: "1653 Sylvan Rd SW, Atlanta, GA 30310",
      home_value: 250_000,
      loan_type: "fha",
      monthly_payment: 2_221,
      version: 1,
      updated_at: new Date().toISOString(),
      inputs: { homeValue: 250_000, loanType: "fha" },
    },
  ]);
  await openCalculator(page);

  await expect(page.getByText("Unassigned")).toBeVisible();
  await page.getByTestId("attach-s-1").click();

  // Pre-filled from the label, which for these saves is the address.
  await expect(page.getByTestId("attach-address-input")).toHaveValue(
    "1653 Sylvan Rd SW, Atlanta, GA 30310"
  );
  await page.getByTestId("attach-address-save").click();

  await expect(page.getByText("Unassigned")).toHaveCount(0);
  await expect(page.getByTestId("match-note")).toContainText("Added");
});

test("the grouped list fits 390px", async ({ page }) => {
  await stubScenarioApi(page);
  await openCalculator(page);

  await page.getByTestId("scenario-address").fill("1653 Sylvan Rd SW, Atlanta");
  await nameField(page).fill("203(k) with $60k of work");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText("203(k) with $60k of work")).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});
