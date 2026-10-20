import { calculateArv } from "@/lib/comps/arv";
import { mapCompStatus, mapComparables, mapSubjectFacts } from "@/lib/comps/fromRentCast";
import { type Comp, type CompStatus } from "@/lib/comps/types";

function comp(overrides: Partial<Comp> = {}): Comp {
  return {
    id: "c-1",
    propertyId: "p-1",
    source: "rentcast",
    externalId: "rc-1",
    formattedAddress: "1 Test St, Duluth, GA 30096",
    city: "Duluth",
    state: "GA",
    zip: "30096",
    latitude: null,
    longitude: null,
    propertyType: "Single Family",
    beds: 3,
    baths: 2,
    sqft: 1_500,
    lotSqft: null,
    yearBuilt: 1995,
    price: 300_000,
    status: "removed",
    listingType: "Standard",
    listedDate: null,
    removedDate: null,
    lastSeenDate: null,
    daysOnMarket: null,
    distanceMiles: 0.5,
    daysOld: 60,
    correlation: 0.9,
    included: true,
    notes: null,
    updatedAt: "2026-10-18T00:00:00.000Z",
    ...overrides,
  };
}

/** Comps at an exact price per sqft, so the median is predictable. */
function compsAtPricePerSqft(perSqft: number[], status: CompStatus = "removed"): Comp[] {
  return perSqft.map((ppsf, i) =>
    comp({ id: `c-${i}`, externalId: `rc-${i}`, sqft: 1_000, price: ppsf * 1_000, status })
  );
}

describe("calculateArv", () => {
  it("takes the median of each comp's price adjusted for size", () => {
    // Comps are 1,000 sqft at 180k-220k; the subject is 1,100 sqft, so each
    // price gains 100 x $40 = $4,000. Median 200,000 -> 204,000.
    const comps = compsAtPricePerSqft([180, 190, 200, 210, 220]);
    const result = calculateArv(comps, 1_100);

    expect(result.value).toBeCloseTo(204_000, 6);
    expect(result.adjustmentPerSqft).toBe(40);
    expect(result.usedComps).toHaveLength(5);
  });

  it("does not scale price per sqft onto a house bigger than its comps", () => {
    // The bug this method replaced: 2,658 sqft against ~2,100 sqft comps that
    // fetched $272k-$389k produced $438,406, above everything in the street.
    const comps = [
      comp({ id: "a", externalId: "rc-a", sqft: 2_752, price: 272_000 }),
      comp({ id: "b", externalId: "rc-b", sqft: 2_250, price: 325_000 }),
      comp({ id: "c", externalId: "rc-c", sqft: 2_122, price: 349_999 }),
      comp({ id: "d", externalId: "rc-d", sqft: 2_123, price: 309_000 }),
      comp({ id: "e", externalId: "rc-e", sqft: 2_008, price: 389_000 }),
      comp({ id: "f", externalId: "rc-f", sqft: 1_800, price: 329_000 }),
    ];

    const result = calculateArv(comps, 2_658);

    expect(result.value).not.toBeNull();
    // Inside the range those houses actually fetched, not above it.
    expect(result.value!).toBeLessThan(400_000);
    expect(result.value!).toBeGreaterThan(300_000);
    expect(result.sanityWarning).toBeNull();
  });

  it("ignores comps that are not included", () => {
    // The whole point of the checkbox. The outlier below would drag a mean to
    // 260 and the median to 210; excluded, it changes nothing.
    const comps = [
      ...compsAtPricePerSqft([180, 190, 200, 210, 220]),
      comp({ id: "outlier", externalId: "rc-outlier", sqft: 1_000, price: 500_000, included: false }),
    ];

    const result = calculateArv(comps, 1_100);

    expect(result.value).toBeCloseTo(204_000, 6);
    expect(result.usedComps).toHaveLength(5);
    expect(result.usedComps.map((c) => c.compId)).not.toContain("outlier");
  });

  it("recomputes when a comp is unchecked", () => {
    const comps = compsAtPricePerSqft([180, 190, 200, 210, 220]);
    const before = calculateArv(comps, 1_000);

    const after = calculateArv(
      comps.map((c) => (c.id === "c-4" ? { ...c, included: false } : c)),
      1_000
    );

    // Same size as the subject, so no adjustment applies either way.
    expect(before.value).toBeCloseTo(200_000, 6);
    // Dropping the 220 leaves [180,190,200,210]; median 195.
    expect(after.value).toBeCloseTo(195_000, 6);
  });

  it("resists a single outlier because it uses the median, not the mean", () => {
    const withOutlier = compsAtPricePerSqft([180, 190, 200, 210, 1_000]);
    const result = calculateArv(withOutlier, 1_000);

    const mean = ((180 + 190 + 200 + 210 + 1_000) / 5) * 1_000;
    expect(result.value).toBeCloseTo(200_000, 6);
    expect(result.value!).toBeLessThan(mean);
  });

  it("reports the mix it was built on", () => {
    const comps = [
      ...compsAtPricePerSqft([180, 200, 220], "sold"),
      ...compsAtPricePerSqft([190, 210], "removed").map((c, i) => ({ ...c, id: `r-${i}` })),
    ];

    const result = calculateArv(comps, 1_000);

    // Two or more sold comps and the listings drop out entirely, so the
    // label describes the sold set the number was actually built on.
    expect(result.soldOnly).toBe(true);
    expect(result.soldCount).toBe(3);
    expect(result.removedCount).toBe(0);
    expect(result.activeCount).toBe(0);
    expect(result.basisLabel).toBe("3 sold");
  });

  it("keeps the listing in the mix when only one comp has sold", () => {
    const comps = [
      ...compsAtPricePerSqft([180], "sold"),
      comp({ id: "r-1", externalId: "rc-r1", sqft: 1_000, price: 190_000, status: "removed" }),
    ];

    expect(calculateArv(comps, 1_000).basisLabel).toBe("1 sold · 1 removed listing");
  });

  it("warns when nothing in the set is a confirmed sale", () => {
    const result = calculateArv(compsAtPricePerSqft([180, 190, 200, 210, 220], "removed"), 1_000);

    expect(result.soldCount).toBe(0);
    expect(result.warnings.join(" ")).toMatch(/None of these are confirmed sales/);
    expect(result.warnings.join(" ")).toMatch(/Add a sold comp from your agent/);
  });

  it("does not warn about sales when the comps are sold", () => {
    const result = calculateArv(compsAtPricePerSqft([180, 190, 200, 210, 220], "sold"), 1_000);

    expect(result.warnings.join(" ")).not.toMatch(/No confirmed sales/);
  });

  it("returns null rather than zero when no comps are included", () => {
    const result = calculateArv(
      compsAtPricePerSqft([180, 200]).map((c) => ({ ...c, included: false })),
      1_500
    );

    // A zero posing as a value would read as "this house is worth nothing".
    expect(result.value).toBeNull();
    expect(result.confidence).toBe("none");
    expect(result.basisLabel).toBe("no comps");
    expect(result.warnings.join(" ")).toMatch(/No comps are included/);
  });

  it("asks for the square footage when the subject has none", () => {
    const result = calculateArv(compsAtPricePerSqft([180, 200, 220]), null);

    expect(result.value).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/Add this house's square footage/);
  });

  it("skips comps with no price or no size and says how many", () => {
    const comps = [
      ...compsAtPricePerSqft([180, 200, 220]),
      comp({ id: "no-price", externalId: "rc-np", sqft: 1_000, price: null }),
      comp({ id: "no-sqft", externalId: "rc-ns", sqft: null }),
    ];

    const result = calculateArv(comps, 1_000);

    expect(result.usedComps).toHaveLength(3);
    expect(result.skippedForMissingData).toBe(2);
    expect(result.warnings.join(" ")).toMatch(/2 included comps were skipped/);
    // The counts describe what the number is built on, not what was ticked.
    expect(result.soldCount + result.removedCount + result.activeCount).toBe(3);
  });

  it("handles every included comp being unusable", () => {
    const result = calculateArv(
      [comp({ id: "a", sqft: 1_000, price: null }), comp({ id: "b", sqft: null })],
      1_000
    );

    expect(result.value).toBeNull();
    expect(result.skippedForMissingData).toBe(2);
  });

  it("grades confidence by how many comps survived", () => {
    expect(calculateArv(compsAtPricePerSqft([200, 210]), 1_000).confidence).toBe("low");
    expect(calculateArv(compsAtPricePerSqft([1, 2, 3, 4, 5].map((n) => 200 + n)), 1_000).confidence).toBe(
      "moderate"
    );
    expect(
      calculateArv(compsAtPricePerSqft([1, 2, 3, 4, 5, 6, 7, 8].map((n) => 200 + n)), 1_000)
        .confidence
    ).toBe("good");
  });

  it("brackets the value with the quartiles of price per sqft", () => {
    const result = calculateArv(compsAtPricePerSqft([180, 190, 200, 210, 220]), 1_000);

    expect(result.valueLow).not.toBeNull();
    expect(result.valueHigh).not.toBeNull();
    expect(result.valueLow!).toBeLessThan(result.value!);
    expect(result.valueHigh!).toBeGreaterThan(result.value!);
  });

  it("discounts a bigger comp without scaling it down by price per sqft", () => {
    // Comps 200 sqft larger than the subject, which is inside the fit rule.
    // Price per sqft would drag these down hard; adjusting at $40 says
    // 400,000 - 200 x 40 = 392,000.
    const comps = [
      comp({ id: "big-1", externalId: "rc-b1", sqft: 1_200, price: 400_000 }),
      comp({ id: "big-2", externalId: "rc-b2", sqft: 1_200, price: 400_000 }),
    ];

    const result = calculateArv(comps, 1_000);

    expect(result.value).toBeCloseTo(392_000, 6);
  });

  it("refuses an ARV when no comp is the same kind of house", () => {
    // White Bird: fourteen comps between 1,938 and 2,505 sqft pulled for a
    // 1,357 sqft house. Every one is a bigger house, so none is evidence.
    const comps = [
      comp({ id: "w-1", externalId: "rc-w1", sqft: 1_938, price: 315_000 }),
      comp({ id: "w-2", externalId: "rc-w2", sqft: 2_250, price: 400_000 }),
      comp({ id: "w-3", externalId: "rc-w3", sqft: 2_505, price: 482_144 }),
    ];

    const result = calculateArv(comps, 1_357);

    expect(result.value).toBeNull();
    expect(result.excludedForFit).toHaveLength(3);
    expect(result.excludedForFit.every((e) => e.reasons.includes("much bigger"))).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/none of the 3 comps here are the same kind of house/i);
  });

  it("flags an ARV that lands outside what the street actually fetched", () => {
    // Cheap comps, so even an in-range size difference adjusts them by more
    // than a tenth of their price. The backstop fires before anyone offers.
    const comps = [
      comp({ id: "s-1", externalId: "rc-s1", sqft: 1_000, price: 50_000 }),
      comp({ id: "s-2", externalId: "rc-s2", sqft: 1_000, price: 52_000 }),
    ];

    const result = calculateArv(comps, 1_200);

    expect(result.nearbyLow).toBe(50_000);
    expect(result.nearbyHigh).toBe(52_000);
    expect(result.sanityWarning).toMatch(/above the most expensive home/);
  });
});

describe("mapCompStatus", () => {
  it("maps Inactive to removed, never to sold", () => {
    expect(mapCompStatus("Inactive")).toBe("removed");
    expect(mapCompStatus("inactive")).toBe("removed");
  });

  it("maps Active to active", () => {
    expect(mapCompStatus("Active")).toBe("active");
  });

  it("defaults an unknown or missing status to active", () => {
    expect(mapCompStatus(undefined)).toBe("active");
    expect(mapCompStatus("Pending")).toBe("active");
  });

  it("can never produce sold from any RentCast value", () => {
    // The guarantee the ARV leans on. RentCast cannot confirm a sale, so a
    // withdrawn listing must never be counted as one.
    for (const value of ["Active", "Inactive", "Sold", "SOLD", "Closed", "", "anything"]) {
      expect(mapCompStatus(value)).not.toBe("sold");
    }
  });
});

describe("mapComparables", () => {
  it("drops a comp with no usable address", () => {
    const mapped = mapComparables([
      { id: "a", formattedAddress: "1 Test St", price: 100 },
      { id: "b", price: 200 },
      { id: "c", addressLine1: "3 Test St", price: 300 },
    ]);

    expect(mapped.map((c) => c.formatted_address)).toEqual(["1 Test St", "3 Test St"]);
  });

  it("turns absent numbers into null rather than zero", () => {
    const [mapped] = mapComparables([{ id: "a", formattedAddress: "1 Test St" }]);

    expect(mapped.price).toBeNull();
    expect(mapped.sqft).toBeNull();
    expect(mapped.beds).toBeNull();
    expect(mapped.correlation).toBeNull();
  });

  it("handles an undefined comparables array", () => {
    expect(mapComparables(undefined)).toEqual([]);
  });
});

describe("mapSubjectFacts", () => {
  it("returns only the keys RentCast actually sent", () => {
    const facts = mapSubjectFacts({ bedrooms: 3, squareFootage: 1_500 });

    // Spreadable over an existing row without a null erasing a typed-in value.
    expect(facts).toEqual({ beds: 3, sqft: 1_500 });
    expect("baths" in facts).toBe(false);
    expect("year_built" in facts).toBe(false);
  });

  it("carries the last sale through", () => {
    const facts = mapSubjectFacts({ lastSaleDate: "2021-06-01", lastSalePrice: 185_000 });

    expect(facts.last_sale_date).toBe("2021-06-01");
    expect(facts.last_sale_price).toBe(185_000);
  });

  it("returns an empty object when there is no subject property", () => {
    expect(mapSubjectFacts(undefined)).toEqual({});
  });
});
