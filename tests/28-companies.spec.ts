import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";

test.use({ storageState: ".playwright/user.json" });

/**
 * Companies: who has the houses.
 *
 * One journey, not one test per field. What each screen SAYS is a Jest test
 * against the wording functions in `tests/unit/companies.test.ts`; this proves
 * only what a browser can — that the screens render, that adding one reaches
 * the API, and that a company's houses link to the house pages.
 *
 * Runs at 390px throughout. The owner works this on a phone.
 */
test.use({ viewport: { width: 390, height: 844 } });

const GROUND_FLOOR = {
  id: "co-1",
  name: "Ground Floor LLC",
  phone: "+14045550123",
  website: "groundfloor.example",
  addressLine1: "100 Peachtree St",
  city: "Atlanta",
  state: "GA",
  zip: "30303",
  notes: null,
  propertyCount: 2,
};

const PORTFOLIO = [
  {
    propertyId: "p1",
    address: "1653 Sylvan Rd SW",
    cityStateZip: "Atlanta, GA, 30310",
    listPrice: 149_900,
    photoUrl: null,
    beds: 3,
    baths: 2,
    sqft: 1_200,
  },
  {
    propertyId: "p2",
    address: "9 Elm Ct",
    cityStateZip: "Atlanta, GA, 30310",
    listPrice: null,
    photoUrl: null,
    beds: null,
    baths: null,
    sqft: null,
  },
];

async function stubEmpty(page: Page) {
  await stubDataEndpoints(page);
  await page.route("**/api/crm/companies?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ companies: [] }) })
  );
}

async function stubOne(page: Page) {
  await stubDataEndpoints(page);
  await page.route("**/api/crm/companies/co-1**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ detail: { company: GROUND_FLOOR, portfolio: PORTFOLIO } }),
    })
  );
  await page.route("**/api/crm/companies?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ companies: [GROUND_FLOOR] }),
    })
  );
}

test("an empty list says what goes there and how to fill it", async ({ page }) => {
  await stubEmpty(page);
  await page.goto("/companies");

  const empty = page.getByTestId("companies-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("No companies yet");
  // Not just a statement — a way out of it.
  await expect(page.getByTestId("companies-empty-add")).toBeVisible();
});

test("adding a company sends what was typed", async ({ page }) => {
  await stubEmpty(page);

  const posted: string[] = [];
  await page.route("**/api/crm/companies?**", async (route) => {
    if (route.request().method() === "POST") {
      posted.push(route.request().postData() ?? "");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ company: GROUND_FLOOR }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ companies: posted.length ? [GROUND_FLOOR] : [] }),
    });
  });

  await page.goto("/companies");
  await page.getByTestId("companies-empty-add").click();

  await page.getByTestId("company-name").fill("Ground Floor LLC");
  await page.getByTestId("company-phone").fill("+14045550123");
  await page.getByTestId("add-company-save").click();

  await expect(page.getByTestId("company-co-1")).toBeVisible();
  expect(posted).toHaveLength(1);
  const sent = JSON.parse(posted[0]);
  expect({ name: sent.name, phone: sent.phone }).toEqual({
    name: "Ground Floor LLC",
    phone: "+14045550123",
  });
});

test("a company shows its portfolio, and each house opens", async ({ page }) => {
  await stubOne(page);
  await page.goto("/companies");

  await page.getByTestId("company-co-1").click();
  await expect(page).toHaveURL(/\/companies\/co-1$/);

  await expect(page.getByTestId("company-name-heading")).toHaveText("Ground Floor LLC");
  await expect(page.getByTestId("company-phone-link")).toBeVisible();

  // A house with nothing recorded still says something, rather than a dash.
  await expect(page.getByTestId("portfolio-p1")).toContainText("$149,900");
  await expect(page.getByTestId("portfolio-p2")).toContainText("No listing price yet");

  await expect(page.getByTestId("portfolio-p1")).toHaveAttribute("href", "/properties/p1");
});

test("adding a house to a portfolio goes through the normal add form", async ({ page }) => {
  await stubOne(page);
  await page.goto("/companies/co-1");

  // A portfolio house is a real house, entered the same way as any other —
  // which is why this links to the add form rather than a second, lesser one.
  await expect(page.getByTestId("add-house-to-portfolio")).toHaveAttribute(
    "href",
    "/properties/new?company=co-1"
  );
});

test("the companies screens fit 390px", async ({ page }) => {
  await stubOne(page);
  await page.goto("/companies/co-1");

  await expect(page.getByTestId("company-name-heading")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});
