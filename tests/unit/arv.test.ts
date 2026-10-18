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
  it("uses the median price per sqft times the subject's size", () => {
    const comps = compsAtPricePerSqft([180, 190, 200, 210, 220]);
    const result = calculateArv(comps, 1_600);

    expect(result.medianPricePerSqft).toBeCloseTo(200, 6);
    expect(result.value).toBeCloseTo(320_000, 6);
    expect(result.usedComps).toHaveLength(5);
  });

  it("ignores comps that are not included", () => {
    // The whole point of the checkbox. The outlier below would drag a mean to
    // 260 and the median to 210; excluded, it changes nothing.
    const comps = [
      ...compsAtPricePerSqft([180, 190, 200, 210, 220]),
      comp({ id: "outlier", externalId: "rc-outlier", sqft: 1_000, price: 500_000, included: false }),
    ];

    const result = calculateArv(comps, 1_600);

    expect(result.medianPricePerSqft).toBeCloseTo(200, 6);
    expect(result.value).toBeCloseTo(320_000, 6);
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

    expect(before.value).toBeCloseTo(200_000, 6);
    // Dropping the 220 leaves [180,190,200,210]; median 195.
    expect(after.value).toBeCloseTo(195_000, 6);
  });

  it("resists a single outlier because it uses the median, not the mean", () => {
    const withOutlier = compsAtPricePerSqft([180, 190, 200, 210, 1_000]);
    const result = calculateArv(withOutlier, 1_000);

    const mean = (180 + 190 + 200 + 210 + 1_000) / 5;
    expect(result.medianPricePerSqft).toBeCloseTo(200, 6);
    expect(result.medianPricePerSqft).toBeLessThan(mean);
  });

  it("reports the mix it was built on", () => {
    const comps = [
      ...compsAtPricePerSqft([180, 200, 220], "sold"),
      ...compsAtPricePerSqft([190, 210], "removed").map((c, i) => ({ ...c, id: `r-${i}` })),
    ];

    const result = calculateArv(comps, 1_000);

    expect(result.soldCount).toBe(3);
    expect(result.removedCount).toBe(2);
    expect(result.activeCount).toBe(0);
    expect(result.basisLabel).toBe("3 sold · 2 removed listings");
  });

  it("singularises one removed listing", () => {
    const comps = [
      ...compsAtPricePerSqft([180, 200], "sold"),
      comp({ id: "r-1", externalId: "rc-r1", sqft: 1_000, price: 190_000, status: "removed" }),
    ];

    expect(calculateArv(comps, 1_000).basisLabel).toBe("2 sold · 1 removed listing");
  });

  it("warns when nothing in the set is a confirmed sale", () => {
    const result = calculateArv(compsAtPricePerSqft([180, 190, 200, 210, 220], "removed"), 1_000);

    expect(result.soldCount).toBe(0);
    expect(result.warnings.join(" ")).toMatch(/No confirmed sales/);
    expect(result.warnings.join(" ")).toMatch(/may not have sold/);
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

  it("returns null when the subject has no square footage", () => {
    const result = calculateArv(compsAtPricePerSqft([180, 200, 220]), null);

    expect(result.value).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/no square footage/);
  });

  it("skips comps with no price or no size and says how many", () => {
    const comps = [
      ...compsAtPricePerSqft([180, 200, 220]),
      comp({ id: "no-price", externalId: "rc-np", price: null }),
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
      [comp({ id: "a", price: null }), comp({ id: "b", sqft: null })],
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

  it("normalises for size rather than averaging prices", () => {
    // Two comps at the same $/sqft but much bigger than the subject. Averaging
    // their prices would say 400,000; the correct answer is 200 × 1,000.
    const comps = [
      comp({ id: "big-1", externalId: "rc-b1", sqft: 2_000, price: 400_000 }),
      comp({ id: "big-2", externalId: "rc-b2", sqft: 2_000, price: 400_000 }),
    ];

    const result = calculateArv(comps, 1_000);

    expect(result.value).toBeCloseTo(200_000, 6);
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
