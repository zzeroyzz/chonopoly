import {
  buildScreenRow,
  sortScreenRows,
  type ScreenHouse,
  type ScreenRow,
} from "@/lib/screen/screenRow";
import { type BuyerProfile } from "@/lib/profile/types";
import { type Comp } from "@/lib/comps/types";

/**
 * One row of the screen table. Pure, so every case here runs with no database.
 */

const NOW = new Date(2026, 0, 1);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    id: "p-1",
    cashAvailable: 60_000,
    cashReserves: 10_000,
    incomes: [{ id: "i-1", label: "Salary", grossMonthly: 12_000, borrower: null }],
    debts: [],
    defaults: {
      loanType: "fha",
      renovationProgram: "none",
      interestRate: 6.5,
      termYears: 30,
      downPaymentPct: 3.5,
      closingCostPct: 5,
      countyLoanLimit: null,
      dpaEnabled: false,
      dpaStructure: "grant",
      dpaRate: 0,
      dpaTermYears: 10,
      buyingPct: 1,
      sellingPct: 8,
      holdingMonthly: 750,
      holdingMonths: 5,
      contingencyPhotosPct: 20,
      contingencyVisitPct: 10,
    },
    ...overrides,
  } as unknown as BuyerProfile;
}

function comp(pricePerSqft: number, id: string): Comp {
  return {
    id,
    propertyId: "prop-1",
    source: "rentcast",
    externalId: id,
    formattedAddress: `${id} Test St`,
    city: null, state: null, zip: null, latitude: null, longitude: null,
    propertyType: null, beds: null, baths: null,
    sqft: 1_600, lotSqft: null, yearBuilt: null,
    price: pricePerSqft * 1_000,
    status: "sold", listingType: null, listedDate: null, removedDate: null,
    lastSeenDate: null, daysOnMarket: null, distanceMiles: null, daysOld: null,
    correlation: null, buyerType: null, buyerName: null, county: null,
    included: true, review: "renovated_use", reviewSetAt: null, salePrice: null, saleDate: null, notes: null, updatedAt: "",
  };
}

function house(overrides: Partial<ScreenHouse> = {}): ScreenHouse {
  return {
    propertyId: "prop-1",
    entryId: "e1",
    addressLine1: "128 Maple St",
    city: "Duluth",
    state: "GA",
    zip: "30096",
    sqft: 1_750,
    annualTaxes: null,
    listingUrl: null,
    needsAddressReview: false,
    visitCompletedAt: null,
    analysisInputs: { homeValue: 250_000 },
    analysisLabel: "at asking",
    hasRehabEstimate: false,
    comps: [],
    baths: null,
    propertyType: null,
    yearBuilt: null,
    ...overrides,
  };
}

describe("the row's figures", () => {
  it("builds a readable address from the parts it has", () => {
    const row = buildScreenRow(house(), { profile: profile(), now: NOW });
    expect(row.address).toBe("128 Maple St, Duluth, GA, 30096");
  });

  it("omits the parts it does not have", () => {
    const row = buildScreenRow(
      house({ city: null, state: null, zip: null }),
      { profile: profile(), now: NOW }
    );
    expect(row.address).toBe("128 Maple St");
  });

  it("takes the price from the primary analysis", () => {
    const row = buildScreenRow(house({ analysisInputs: { homeValue: 312_500 } }), {
      profile: profile(),
      now: NOW,
    });
    expect(row.price).toBe(312_500);
  });

  it("prefers the house's own tax bill over the default", () => {
    const withTaxes = buildScreenRow(house({ annualTaxes: 7_200 }), { profile: profile(), now: NOW });
    const without = buildScreenRow(house(), { profile: profile(), now: NOW });

    // A real bill beats an assumption, and it moves PITI.
    expect(withTaxes.piti).toBeGreaterThan(without.piti);
  });

  it("computes PITI, DTI and cash to close", () => {
    const row = buildScreenRow(house(), { profile: profile(), now: NOW });

    expect(row.piti).toBeGreaterThan(0);
    expect(row.backDti).not.toBeNull();
    expect(row.cashToClose).toBeGreaterThan(0);
  });
});

describe("the ARV and the deal", () => {
  it("has no ARV and no deal figures with no comps", () => {
    const row = buildScreenRow(house(), { profile: profile(), now: NOW });

    // Null, not zero — zero would read as a worthless house rather than one
    // nobody has priced.
    expect(row.arv).toBeNull();
    expect(row.walkAwayCash).toBeNull();
    expect(row.trueProfit).toBeNull();
    expect(row.marginPct).toBeNull();
    expect(row.deal.hasArv).toBe(false);
  });

  it("derives the ARV from the included comps", () => {
    const row = buildScreenRow(
      house({ comps: [comp(200, "a"), comp(210, "b"), comp(220, "c")] }),
      { profile: profile(), now: NOW }
    );

    // Median price $210,000, plus 150 sqft of size difference at $40.
    expect(row.arv).toBeCloseTo(210_000 + 150 * 40, 6);
  });

  it("ignores comps the owner skipped", () => {
    const comps = [
      comp(200, "a"),
      comp(210, "b"),
      { ...comp(900, "outlier"), review: "not_comparable_skip" as const },
    ];
    const row = buildScreenRow(house({ comps }), { profile: profile(), now: NOW });

    // Median of 200,000 and 210,000, plus the same size adjustment.
    expect(row.arv).toBeCloseTo(205_000 + 150 * 40, 6);
  });

  it("has no ARV until a comp is approved", () => {
    const unreviewed = buildScreenRow(house({ comps: [{ ...comp(200, "a"), review: "needs_review" as const }] }), {
      profile: profile(),
      now: NOW,
    });
    const reviewed = buildScreenRow(house({ comps: [comp(200, "a")] }), {
      profile: profile(),
      now: NOW,
    });

    expect(unreviewed.arv).toBeNull();
    expect(unreviewed.approvedComps).toBe(0);
    expect(reviewed.approvedComps).toBe(1);
  });

  it("counts nothing to review on a house with no comps", () => {
    const row = buildScreenRow(house(), { profile: profile(), now: NOW });

    expect(row.arv).toBeNull();
    expect(row.approvedComps).toBe(0);
    expect(row.compsToReview).toBe(0);
  });

  it("reports max offer as a figure", () => {
    const row = buildScreenRow(house({ comps: [comp(200, "a")] }), { profile: profile(), now: NOW });

    // One comp at 200,000 plus 150 sqft at $40 is a 206,000 ARV; 70% of it,
    // less no rehab.
    expect(row.maxOffer).toBeCloseTo(206_000 * 0.7, 6);
  });
});

describe("the progress checklist", () => {
  it("derives each step rather than storing it", () => {
    const row = buildScreenRow(
      house({
        analysisInputs: { homeValue: 250_000 },
        comps: [comp(200, "a")],
        hasRehabEstimate: true,
        visitCompletedAt: "2026-01-05T00:00:00.000Z",
      }),
      { profile: profile(), now: NOW }
    );

    expect(row.checklist).toMatchObject({
      numbers: true,
      comps: true,
      estimate: true,
      visit: true,
      done: 4,
    });
  });

  it("counts a fresh house as nothing done", () => {
    const row = buildScreenRow(
      house({ analysisInputs: null, analysisLabel: null }),
      { profile: profile(), now: NOW }
    );

    expect(row.checklist.done).toBe(0);
    expect(row.checklist.numbers).toBe(false);
  });

  it("counts partial progress", () => {
    const row = buildScreenRow(house({ comps: [comp(200, "a")] }), { profile: profile(), now: NOW });

    // Numbers and comps, not estimate or visit.
    expect(row.checklist.done).toBe(2);
    expect(row.checklist.estimate).toBe(false);
    expect(row.checklist.visit).toBe(false);
  });
});

describe("the empty-profile state", () => {
  it("asks for income instead of judging", () => {
    const row = buildScreenRow(house(), { profile: null, now: NOW });

    expect(row.affordability.needsProfile).toBe(true);
    expect(row.affordability.summary).toBe("Set your income");
  });

  it("still computes the house's own numbers", () => {
    // The price and the payment do not depend on who is buying.
    const row = buildScreenRow(house(), { profile: null, now: NOW });

    expect(row.price).toBe(250_000);
    expect(row.piti).toBeGreaterThan(0);
  });
});

describe("sortScreenRows", () => {
  /** Only the three fields the sort reads; the rest is irrelevant here. */
  function rowWith(
    deal: "works" | "thin" | "does_not_work",
    affordability: "qualifies" | "tight" | "does_not_qualify",
    trueProfit: number | null
  ): ScreenRow {
    return {
      deal: { verdict: deal },
      affordability: { verdict: affordability },
      trueProfit,
    } as unknown as ScreenRow;
  }

  it("puts the houses worth acting on first", () => {
    const rows = [
      rowWith("does_not_work", "qualifies", 0),
      rowWith("thin", "qualifies", 20_000),
      rowWith("works", "tight", 50_000),
      rowWith("works", "qualifies", 40_000),
    ];

    const sorted = sortScreenRows(rows);

    // Works before thin before doesn't work; within works, qualifying first.
    expect(sorted.map((r) => [r.deal.verdict, r.affordability.verdict])).toEqual([
      ["works", "qualifies"],
      ["works", "tight"],
      ["thin", "qualifies"],
      ["does_not_work", "qualifies"],
    ]);
  });

  it("breaks a tie on the bigger payday", () => {
    const sorted = sortScreenRows([
      rowWith("works", "qualifies", 30_000),
      rowWith("works", "qualifies", 80_000),
    ]);

    expect(sorted[0].trueProfit).toBe(80_000);
  });

  it("puts rows with no true profit figure last", () => {
    const sorted = sortScreenRows([
      rowWith("works", "qualifies", null),
      rowWith("works", "qualifies", 10_000),
    ]);

    expect(sorted[0].trueProfit).toBe(10_000);
  });

  it("does not mutate the input", () => {
    const rows = [rowWith("thin", "qualifies", 1), rowWith("works", "qualifies", 2)];
    const before = rows.map((r) => r.trueProfit);
    sortScreenRows(rows);
    expect(rows.map((r) => r.trueProfit)).toEqual(before);
  });
});
