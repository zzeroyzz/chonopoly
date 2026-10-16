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

interface StoredScenario {
  id: string;
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

  // The real route maps rows to camelCase before returning them. The stub has
  // to do the same or it is testing a contract the app does not have.
  const asSummary = (s: StoredScenario) => ({
    id: s.id,
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

    const existing = store.find((s) => s.label.toLowerCase() === body.label.toLowerCase());
    if (existing) {
      existing.version += 1;
      existing.inputs = body.inputs;
      existing.monthly_payment = body.monthly_payment;
      existing.home_value = body.inputs.homeValue as number;
    } else {
      store.push({
        id: `s-${store.length + 1}`,
        label: body.label,
        home_value: body.inputs.homeValue as number,
        loan_type: body.inputs.loanType as string,
        monthly_payment: body.monthly_payment,
        version: 1,
        updated_at: new Date().toISOString(),
        inputs: body.inputs,
      });
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
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
