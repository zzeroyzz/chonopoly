import { portfolioLine } from "@/components/crm/CompaniesPage";
import { houseLine, priceLine } from "@/components/crm/CompanyDetailPage";
import { type PortfolioHouse } from "@/lib/crm/types";
import { NO_LISTING_PRICE_LABEL } from "@/lib/property/types";

/**
 * What the companies screens say.
 *
 * Both screens are readers — every figure is already on the row by the time
 * they render — so the only thing that can be wrong is the wording, and
 * wording is a unit test against the function rather than a browser test
 * against the screen.
 */

function house(overrides: Partial<PortfolioHouse> = {}): PortfolioHouse {
  return {
    propertyId: "p1",
    address: "1653 Sylvan Rd SW",
    cityStateZip: "Atlanta, GA, 30310",
    listPrice: 149_900,
    photoUrl: null,
    beds: 3,
    baths: 2,
    sqft: 1_200,
    ...overrides,
  };
}

describe("how many houses a company has", () => {
  /** A zero is a state, not a count, and it says what to do about itself. */
  it("does not report nothing as a count", () => {
    expect(portfolioLine(0)).toBe("No houses recorded yet");
  });

  it("counts one as one, not as ones", () => {
    expect(portfolioLine(1)).toBe("1 house in their portfolio");
  });

  it("counts the rest", () => {
    expect(portfolioLine(12)).toBe("12 houses in their portfolio");
  });
});

describe("what a portfolio house says about itself", () => {
  it("reads left to right, the way the house card does", () => {
    expect(houseLine(house())).toBe("3 bed · 2 bath · 1,200 sq ft");
  });

  it("leaves out what nobody has recorded rather than printing a dash", () => {
    expect(houseLine(house({ baths: null, sqft: null }))).toBe("3 bed");
  });

  /** A house straight off a lender's list often has nothing but an address. */
  it("says so when there is nothing recorded at all", () => {
    expect(houseLine(house({ beds: null, baths: null, sqft: null }))).toBe(
      "No details recorded yet"
    );
  });

  it("gives the asking price in whole dollars", () => {
    expect(priceLine(house())).toBe("$149,900");
  });

  /**
   * A missing price is not a free house. "$0" would read as one, which is the
   * same mistake the work tile made before it was fixed.
   */
  it("does not report a missing price as zero", () => {
    expect(priceLine(house({ listPrice: null }))).toBe(NO_LISTING_PRICE_LABEL);
    expect(priceLine(house({ listPrice: null }))).not.toContain("$0");
  });

  it("reports a genuine zero as a figure, because somebody typed it", () => {
    expect(priceLine(house({ listPrice: 0 }))).toBe("$0");
  });
});
