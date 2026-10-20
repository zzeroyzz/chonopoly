import { test, expect, type Page } from "@playwright/test";
import { stubDataEndpoints } from "./helpers";
import { calculateArv, subjectOptions } from "@/lib/comps/arv";
import { mapPropertyRecords } from "@/lib/comps/fromPropertyRecords";
import { type Comp } from "@/lib/comps/types";
import { type RentCastPropertyRecord } from "@/lib/rentcast/types";

/**
 * Recorded sales on the ARV tab.
 *
 * Opens through `tab-arv`. There is no Comps tab — the comps live in the
 * comps section of the ARV tab, and the specs that clicked `tab-comps` sat
 * silently red for 52 tests until that was found.
 *
 * The records below are six of the ten county records RentCast actually
 * returned for 1653 Sylvan Rd SW on 2026-10-20, trimmed to the fields the
 * screen reads. That call used saleDateRange=180; the app now sends 365,
 * which changes how many records come back but nothing about their shape.
 *
 * Everything is stubbed. No RentCast calls, no database writes.
 */

test.use({ storageState: ".playwright/user.json" });
test.use({ viewport: { width: 390, height: 844 } });

const PROPERTY_ID = "prop-sylvan";
const SUBJECT = { sqft: 1_200, beds: 3, baths: 2, property_type: "single_family", year_built: 1930 };

/** Straight from the stored response body. */
const COUNTY_RECORDS: RentCastPropertyRecord[] = [
  {
    id: "952-Estes-Dr-SW", formattedAddress: "952 Estes Dr SW, Atlanta, GA 30310",
    county: "Fulton", propertyType: "Single Family", bedrooms: 3, bathrooms: 2,
    squareFootage: 1_164, yearBuilt: 1940,
    lastSaleDate: "2026-05-15T00:00:00.000Z", lastSalePrice: 298_342,
    owner: { type: "Individual", names: ["Kimberly D Williams"] },
  },
  {
    id: "1074-Astor-Ave-SW", formattedAddress: "1074 Astor Ave SW, Atlanta, GA 30310",
    county: "Fulton", propertyType: "Single Family", bedrooms: 3, bathrooms: 1,
    squareFootage: 984, yearBuilt: 1945,
    lastSaleDate: "2026-06-01T00:00:00.000Z", lastSalePrice: 369_900,
    owner: { type: "Individual", names: ["A Buyer"] },
  },
  {
    id: "1470-Graham-St-SW", formattedAddress: "1470 Graham St SW, Atlanta, GA 30310",
    county: "Fulton", propertyType: "Single Family", bedrooms: 2, bathrooms: 2,
    squareFootage: 1_204, yearBuilt: 1926,
    lastSaleDate: "2026-08-24T00:00:00.000Z", lastSalePrice: 274_300,
    owner: { type: "Individual", names: ["B Buyer"] },
  },
  {
    // Under the ceiling AND bought by a company. Sits inside the ARV.
    id: "1842-Lisbon-Dr-SW", formattedAddress: "1842 Lisbon Dr SW, Atlanta, GA 30310",
    county: "Fulton", propertyType: "Single Family", bedrooms: 3, bathrooms: 1,
    squareFootage: 1_048, yearBuilt: 1948,
    lastSaleDate: "2026-04-28T00:00:00.000Z", lastSalePrice: 145_000,
    owner: { type: "Organization", names: ["GEORGIA TARGET PROPERTIES LTD"] },
  },
  {
    id: "1233-Oakland-Dr-SW", formattedAddress: "1233 Oakland Dr SW, Atlanta, GA 30310",
    county: "Fulton", propertyType: "Single Family", bedrooms: 4, bathrooms: 2,
    squareFootage: 1_280, yearBuilt: 1930,
    lastSaleDate: "2026-07-29T00:00:00.000Z", lastSalePrice: 244_600,
    owner: { type: "Individual", names: ["C Buyer"] },
  },
  {
    // A 2003 build against a 1930 house, and much bigger. Excluded twice over.
    id: "948-Byron-Dr-SW", formattedAddress: "948 Byron Dr SW, Atlanta, GA 30310",
    county: "Fulton", propertyType: "Single Family", bedrooms: 3, bathrooms: 2,
    squareFootage: 1_652, yearBuilt: 2003,
    lastSaleDate: "2026-05-27T00:00:00.000Z", lastSalePrice: 334_000,
    owner: { type: "Organization", names: ["ELMWOOD HOMES LLC"] },
  },
];

function recordedSaleComps(): Comp[] {
  return mapPropertyRecords(COUNTY_RECORDS).map((sale, index) => ({
    id: sale.external_id ?? `sale-${index}`,
    propertyId: PROPERTY_ID,
    source: "public_record" as const,
    externalId: sale.external_id,
    formattedAddress: sale.formatted_address,
    city: sale.city,
    state: sale.state,
    zip: sale.zip,
    latitude: sale.latitude,
    longitude: sale.longitude,
    propertyType: sale.property_type,
    beds: sale.beds,
    baths: sale.baths,
    sqft: sale.sqft,
    lotSqft: sale.lot_sqft,
    yearBuilt: sale.year_built,
    price: sale.price,
    status: sale.status,
    listingType: null,
    listedDate: null,
    removedDate: sale.removed_date,
    lastSeenDate: sale.removed_date,
    daysOnMarket: null,
    // Inside the 1 mile the search asked for.
    distanceMiles: 0.5,
    daysOld: null,
    correlation: null,
    buyerType: sale.buyer_type,
    buyerName: sale.buyer_name,
    county: sale.county,
    included: true,
    notes: null,
    updatedAt: sale.removed_date ?? "",
  }));
}

/** One removed listing, so an old house's listings can be checked too. */
function listingComp(): Comp {
  return {
    id: "old-listing",
    propertyId: PROPERTY_ID,
    source: "rentcast",
    externalId: "rc-old",
    formattedAddress: "1547 Melrose Dr SW, Atlanta, GA 30310",
    city: "Atlanta", state: "GA", zip: "30310",
    latitude: null, longitude: null,
    propertyType: "Single Family", beds: 3, baths: 2,
    sqft: 1_222, lotSqft: null, yearBuilt: 1940,
    price: 345_000, status: "removed",
    listingType: "Standard", listedDate: "2026-03-01", removedDate: "2026-06-01",
    lastSeenDate: "2026-06-01", daysOnMarket: 92, distanceMiles: 0.32, daysOld: 40,
    correlation: 0.9, buyerType: null, buyerName: null, county: null,
    included: true, notes: null, updatedAt: "",
  };
}

function entryDetail() {
  return {
    detail: {
      entry: {
        id: "e1", owner_type: "personal", owner_id: "user-1", property_id: PROPERTY_ID,
        stage: "new_lead", stage_since: new Date().toISOString(), next_follow_up_at: null,
        source: "manual", assigned_to: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
      property: {
        id: PROPERTY_ID, address_line1: "1653 Sylvan Rd SW", city: "Atlanta",
        state: "GA", zip: "30310", sqft: SUBJECT.sqft, needs_address_review: false,
      },
      contacts: [], tasks: [], activities: [], stageHistory: [],
    },
  };
}

async function stubRecordedSales(page: Page, initial: Comp[]) {
  await stubDataEndpoints(page);

  let comps = initial;

  const body = () =>
    JSON.stringify({
      comps,
      arv: calculateArv(comps, SUBJECT.sqft, subjectOptions(SUBJECT)),
      subjectSqft: SUBJECT.sqft,
      subjectBeds: SUBJECT.beds,
      subjectBaths: SUBJECT.baths,
      subjectPropertyType: SUBJECT.property_type,
      subjectYearBuilt: SUBJECT.year_built,
    });

  const json = (payload: string, status = 200) => ({
    status,
    contentType: "application/json",
    body: payload,
  });

  await page.route("**/api/crm/entry/**", (route) => route.fulfill(json(JSON.stringify(entryDetail()))));

  // The property page reads its detail from the property route, not the CRM
  // entry route above. Without this the page never renders and every test
  // times out waiting for a tab.
  await page.route("**/api/properties/*", (route) => {
    if (!route.request().url().includes("detail=1")) return route.fallback();
    return route.fulfill(json(JSON.stringify(entryDetail())));
  });

  await page.route("**/api/crm/pipeline**", (route) => route.fulfill(json(JSON.stringify({ rows: [] }))));
  await page.route("**/api/mortgage/scenarios**", (route) =>
    route.fulfill(json(JSON.stringify({ scenarios: [] })))
  );

  // Playwright matches routes in REVERSE registration order, so the broad
  // collection pattern goes first and the most specific last. Otherwise
  // `**/comps**` swallows `/comps/refresh` and `/comps/<id>` and every
  // mutation silently returns the unchanged list.
  await page.route("**/api/properties/*/comps**", (route) => route.fulfill(json(body())));

  await page.route("**/api/properties/*/comps/refresh**", (route) =>
    route.fulfill(
      json(
        JSON.stringify({
          usage: { used: 12, cap: 45, planLimit: 50, remaining: 33, atCap: false },
          mode: "live",
          connected: true,
          locked: false,
          fetchedAt: null,
          nextRefreshAt: null,
          canForce: true,
          canRebuild: false,
          windowDays: 30,
        })
      )
    )
  );

  // Ticking and unticking, recomputed with the real calculator.
  await page.route("**/api/properties/*/comps/**", (route) => {
    const request = route.request();
    if (request.url().includes("/comps/refresh")) return route.fallback();

    if (request.method() === "PATCH") {
      const compId = new URL(request.url()).pathname.split("/").pop() ?? "";
      const payload = JSON.parse(request.postData() ?? "{}") as { included?: boolean };
      comps = comps.map((comp) =>
        comp.id === compId ? { ...comp, included: payload.included ?? comp.included } : comp
      );
      return route.fulfill(json(body()));
    }

    return route.fallback();
  });
}

async function openArvTab(page: Page) {
  await page.goto("/properties/e1");
  await page.getByTestId("tab-arv").click();
  await expect(page.getByTestId("panel-comps")).toBeVisible();
}

test("recorded sales show as Sold, marked county record", async ({ page }) => {
  await stubRecordedSales(page, recordedSaleComps());
  await openArvTab(page);

  const comp = page.getByTestId("comp-952-Estes-Dr-SW");
  await expect(comp).toContainText("Sold");
  await expect(comp).toContainText("sold for");
  await expect(page.getByTestId("comp-provenance-952-Estes-Dr-SW")).toHaveText("county record");
});

test("the ARV is built from sales alone and says so", async ({ page }) => {
  await stubRecordedSales(page, recordedSaleComps());
  await openArvTab(page);

  // Five eligible sales out of six; 948 Byron is much bigger and a 2003 build.
  await expect(page.getByTestId("arv-value")).toHaveText("$274,140");
  await expect(page.getByTestId("arv-basis")).toContainText("5 sold");
  await expect(page.getByTestId("arv-plain")).toContainText("that sold");
});

test("a listing keeps its Removed label beside the sales", async ({ page }) => {
  await stubRecordedSales(page, [...recordedSaleComps(), listingComp()]);
  await openArvTab(page);

  const listing = page.getByTestId("comp-old-listing");
  await expect(listing).toContainText("Removed");
  // Only a sale gets a price qualifier, and a listing is not a county record.
  await expect(page.getByTestId("comp-provenance-old-listing")).toHaveCount(0);
  await expect(page.getByTestId("comp-price-meaning-old-listing")).toHaveCount(0);
});

test("a possible fixer-upper is flagged, says why, and stays ticked", async ({ page }) => {
  await stubRecordedSales(page, recordedSaleComps());
  await openArvTab(page);

  const flag = page.getByTestId("comp-fixer-1842-Lisbon-Dr-SW");
  await expect(flag).toContainText("Bought by a company");
  await expect(flag).toContainText("GEORGIA TARGET PROPERTIES LTD");
  await expect(flag).toContainText("$145,000");
  await expect(flag).toContainText("Untick it to leave it out");

  // Flagged is not excluded. It is still counted.
  await expect(page.getByTestId("comp-include-1842-Lisbon-Dr-SW")).toBeChecked();
});

test("unticking the flagged sale moves the ARV", async ({ page }) => {
  await stubRecordedSales(page, recordedSaleComps());
  await openArvTab(page);

  await expect(page.getByTestId("arv-value")).toHaveText("$274,140");

  // $145,000 adjusted to $151,080 is the bottom of the five-comp median.
  await page.getByTestId("comp-include-1842-Lisbon-Dr-SW").click();

  await expect(page.getByTestId("arv-value")).not.toHaveText("$274,140");
  await expect(page.getByTestId("arv-basis")).toContainText("4 sold");
});

test("an ordinary sale carries no fixer flag", async ({ page }) => {
  await stubRecordedSales(page, recordedSaleComps());
  await openArvTab(page);

  await expect(page.getByTestId("comp-fixer-952-Estes-Dr-SW")).toHaveCount(0);
});

test("the ARV tab fits 390px with recorded sales on it", async ({ page }) => {
  await stubRecordedSales(page, [...recordedSaleComps(), listingComp()]);
  await openArvTab(page);

  // The one number that must never be pushed off screen.
  await expect(page.getByTestId("arv-value")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);

  for (const id of ["comp-1842-Lisbon-Dr-SW", "comp-952-Estes-Dr-SW", "arv-card"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
});
