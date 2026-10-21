import { calculateArv, assessComps, effectivePrice } from "@/lib/comps/arv";
import { mapCompStatus, mapComparables, mapSubjectFacts } from "@/lib/comps/fromRentCast";
import {
  type Comp,
  type CompStatus,
  compReviewOptions,
  isReviewable,
  isSkipped,
  COMP_REVIEW_ORDER,
  COMP_REVIEW_SKIPS,
} from "@/lib/comps/types";
import { matchesFilter, defaultTab, type CompFilter } from "@/components/crm/CompControls";
import { comparedToSubject } from "@/lib/comps/format";

/**
 * The address is derived from the id so that every comp is a different house.
 * Sharing one address made the whole set look like one listing repeated, which
 * is exactly what the duplicate check is for.
 */
function comp(overrides: Partial<Comp> = {}): Comp {
  const id = overrides.id ?? "c-1";
  return {
    id,
    propertyId: "p-1",
    source: "rentcast",
    externalId: "rc-1",
    formattedAddress: `${id} Test St, Duluth, GA 30096`,
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
    buyerType: null,
    buyerName: null,
    county: null,
    included: true,
    review: "renovated_use",
    reviewSetAt: null,
    reviewNotes: null,
    salePrice: null,
    saleDate: null,
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

  it("ignores comps the owner skipped", () => {
    // The whole point of the review. The outlier below would drag a mean to
    // 260 and the median to 210; skipped, it changes nothing.
    const comps = [
      ...compsAtPricePerSqft([180, 190, 200, 210, 220]),
      comp({ id: "outlier", externalId: "rc-outlier", sqft: 1_000, price: 500_000,
             review: "not_comparable_skip" }),
    ];

    const result = calculateArv(comps, 1_100);

    expect(result.value).toBeCloseTo(204_000, 6);
    expect(result.usedComps).toHaveLength(5);
    expect(result.usedComps.map((c) => c.compId)).not.toContain("outlier");
  });

  it("recomputes when a comp is skipped", () => {
    const comps = compsAtPricePerSqft([180, 190, 200, 210, 220]);
    const before = calculateArv(comps, 1_000);

    const after = calculateArv(
      comps.map((c) => (c.id === "c-4" ? { ...c, review: "not_renovated_skip" as const } : c)),
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
    expect(result.basisLabel).toBe("Based on 3 comps you approved");
  });

  it("keeps the listing in the mix when only one comp has sold", () => {
    const comps = [
      ...compsAtPricePerSqft([180], "sold"),
      comp({ id: "r-1", externalId: "rc-r1", sqft: 1_000, price: 190_000, status: "removed" }),
    ];

    expect(calculateArv(comps, 1_000).basisLabel).toBe("Based on 2 comps you approved");
  });

  it("says a set with no sales is not confirmed, and what to do about it", () => {
    const result = calculateArv(compsAtPricePerSqft([180, 190, 200, 210, 220], "removed"), 1_000);

    expect(result.soldCount).toBe(0);
    expect(result.warnings).toContain(
      "None of these are confirmed sales yet. Add sold comps to firm it up."
    );
  });

  it("says how many are asking prices when the set is mixed", () => {
    const comps = [
      ...compsAtPricePerSqft([180, 190], "sold"),
      comp({ id: "r-1", externalId: "rc-r1", sqft: 1_000, price: 200_000, status: "removed" }),
    ];

    // Two sales means sold-only takes over and the listing drops out, so the
    // mixed warning must not claim a listing is still in the number.
    const result = calculateArv(comps, 1_000);

    expect(result.soldOnly).toBe(true);
    expect(result.warnings.join(" ")).not.toMatch(/asking price/);
  });

  it("warns about the one listing propping up a single sale", () => {
    const comps = [
      ...compsAtPricePerSqft([180], "sold"),
      comp({ id: "r-1", externalId: "rc-r1", sqft: 1_000, price: 200_000, status: "removed" }),
    ];

    const result = calculateArv(comps, 1_000);

    expect(result.soldOnly).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/1 of these is a listing, not a confirmed sale/);
  });

  it("does not call a sold set asking prices", () => {
    const result = calculateArv(compsAtPricePerSqft([180, 190, 200, 210, 220], "sold"), 1_000);

    expect(result.warnings.join(" ")).not.toMatch(/asking/);
  });

  it("says a sold set sold, and claims nothing extra for listings", () => {
    const listings = calculateArv(compsAtPricePerSqft([180, 190, 200], "removed"), 1_000);
    const sales = calculateArv(compsAtPricePerSqft([180, 190, 200], "sold"), 1_000);

    expect(sales.plainSummary).toMatch(/that sold/);
    // The listing warning carries that point; the headline must not also make
    // a second, differently worded claim about the same thing.
    expect(listings.plainSummary).not.toMatch(/sold|asked/);
  });

  it("asks for a review rather than showing a number, when nothing is approved", () => {
    const result = calculateArv(
      compsAtPricePerSqft([180, 200]).map((c) => ({ ...c, review: "needs_review" as const })),
      1_500
    );

    // A zero posing as a value would read as "this house is worth nothing",
    // and a warning would say something is wrong. Nothing is wrong — the
    // work simply has not been done.
    expect(result.value).toBeNull();
    expect(result.confidence).toBe("none");
    expect(result.warnings).toEqual([]);
    expect(result.reviewPrompt).toBe("Review comps to get an ARV. 2 to go.");
    expect(result.stillToReview).toBe(2);
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

  it("starts none of a set of bigger houses ticked", () => {
    // White Bird: fourteen comps between 1,938 and 2,505 sqft pulled for a
    // 1,357 sqft house. Every one is a bigger house, so none starts counted.
    const comps = [
      comp({ id: "w-1", externalId: "rc-w1", sqft: 1_938, price: 315_000 }),
      comp({ id: "w-2", externalId: "rc-w2", sqft: 2_250, price: 400_000 }),
      comp({ id: "w-3", externalId: "rc-w3", sqft: 2_505, price: 482_144 }),
    ];

    const verdicts = assessComps(comps, 1_357);

    expect([...verdicts.values()].every((v) => v.reasons.includes("much bigger"))).toBe(true);
    expect([...verdicts.values()].every((v) => !v.passes)).toBe(true);
  });

  it("counts a failing comp anyway once it is ticked, and says why", () => {
    // The tick is the answer. A comp the owner ticked on purpose counts, and
    // the card says it counted despite the reason rather than hiding either.
    const comps = [
      comp({ id: "w-1", externalId: "rc-w1", sqft: 1_938, price: 315_000, included: true }),
      comp({ id: "w-2", externalId: "rc-w2", sqft: 2_250, price: 400_000, included: true }),
    ];

    const result = calculateArv(comps, 1_357);

    expect(result.value).not.toBeNull();
    expect(result.usedComps).toHaveLength(2);
    const note = result.compNotes.find((n) => n.compId === "w-1")!;
    expect(note.counted).toBe(true);
    expect(note.countedByOverride).toBe(true);
    expect(note.reasons).toContain("much bigger");
  });

  it("never counts an unreviewed comp, however well it fits", () => {
    const comps = [comp({ id: "u-1", review: "needs_review" })];

    const result = calculateArv(comps, 1_500);

    expect(result.value).toBeNull();
    expect(result.compNotes[0].counted).toBe(false);
  });

  it("will not start a townhouse ticked for a detached house", () => {
    const comps = [
      comp({ id: "t-1", externalId: "rc-t1", propertyType: "Townhouse" }),
      comp({ id: "t-2", externalId: "rc-t2", propertyType: "Condo" }),
      comp({ id: "t-3", externalId: "rc-t3", propertyType: "Single Family" }),
    ];

    const verdicts = assessComps(comps, 1_500, { subjectPropertyType: "single_family" });

    expect(verdicts.get("t-1")!.reasons).toEqual(["a townhouse, not a single-family home"]);
    expect(verdicts.get("t-2")!.reasons).toEqual(["a condo, not a single-family home"]);
    expect(verdicts.get("t-3")!.passes).toBe(true);
  });

  it("treats Single Family and single_family as the same type", () => {
    // Our column is snake_case and RentCast's is title case. A literal
    // comparison would reject every comp as the wrong kind of house.
    const result = calculateArv([comp({ propertyType: "Single Family" })], 1_500, {
      subjectPropertyType: "single_family",
    });

    expect(result.excludedForFit).toHaveLength(0);
    expect(result.usedComps).toHaveLength(1);
  });

  it("allows a bathroom either way and rejects the second one", () => {
    const comps = [
      comp({ id: "b-1", externalId: "rc-b1", baths: 3 }),
      comp({ id: "b-2", externalId: "rc-b2", baths: 4 }),
      comp({ id: "b-3", externalId: "rc-b3", baths: 1 }),
    ];

    const verdicts = assessComps(comps, 1_500, { subjectBaths: 2 });

    expect(verdicts.get("b-1")!.passes).toBe(true);
    expect(verdicts.get("b-3")!.passes).toBe(true);
    expect(verdicts.get("b-2")!.reasons).toEqual(["2 more bathrooms"]);
  });

  it("says a half bathroom as a half, not as a rounded whole", () => {
    const verdicts = assessComps([comp({ baths: 4.5 })], 1_500, { subjectBaths: 2 });

    expect(verdicts.get("c-1")!.reasons).toEqual(["2.5 more bathrooms"]);
  });

  it("rejects a new build as a comp for an old house", () => {
    // 674 White Bird Way: a 1965 house against a 2004-2026 subdivision. Size
    // caught these too, but age catches them on its own.
    const comps = [
      comp({ id: "y-1", externalId: "rc-y1", yearBuilt: 2026 }),
      comp({ id: "y-2", externalId: "rc-y2", yearBuilt: 1970 }),
    ];

    const verdicts = assessComps(comps, 1_500, { subjectYearBuilt: 1965 });

    expect(verdicts.get("y-1")!.reasons).toEqual(["built 2026, 61 years newer"]);
    expect(verdicts.get("y-2")!.passes).toBe(true);
  });

  it("names an older comp as older, not newer", () => {
    // The subject is the modern one here, so the rule fires on the gap and
    // the wording has to follow the comp, not the newer of the two.
    const verdicts = assessComps([comp({ yearBuilt: 1960 })], 1_500, { subjectYearBuilt: 2020 });

    expect(verdicts.get("c-1")!.reasons).toEqual(["built 1960, 60 years older"]);
  });

  it("keeps two old houses a generation apart", () => {
    // 1653 Sylvan Rd SW is built 1930 and the street around it is 1950s. A
    // flat +/-20 years threw out five of fifteen comps, four of them the
    // cheapest, and pushed the ARV up $30,820. Neither house is a modern
    // build, so age says nothing here.
    const comps = [
      comp({ id: "o-1", externalId: "rc-o1", yearBuilt: 1951 }),
      comp({ id: "o-2", externalId: "rc-o2", yearBuilt: 1965 }),
      comp({ id: "o-3", externalId: "rc-o3", yearBuilt: 1915 }),
    ];

    const result = calculateArv(comps, 1_500, { subjectYearBuilt: 1930 });

    expect(result.excludedForFit).toHaveLength(0);
    expect(result.usedComps).toHaveLength(3);
  });

  it("keeps a modern comp that is close in age", () => {
    // Built this century, but only 10 years apart. One condition is not both.
    const result = calculateArv([comp({ yearBuilt: 2020 })], 1_500, { subjectYearBuilt: 2010 });

    expect(result.excludedForFit).toHaveLength(0);
  });

  it("excludes exactly at the boundary, and keeps one year inside it", () => {
    const atBoundary = assessComps([comp({ yearBuilt: 2000 })], 1_500, { subjectYearBuilt: 1970 });
    const justInside = assessComps([comp({ yearBuilt: 1999 })], 1_500, { subjectYearBuilt: 1970 });

    // 2000 is modern and the gap is exactly 30.
    expect(atBoundary.get("c-1")!.reasons).toEqual(["built 2000, 30 years newer"]);
    // 1999 is not modern, so the same 29-year gap says nothing.
    expect(justInside.get("c-1")!.passes).toBe(true);
  });

  it("skips a check the subject has no fact for, rather than failing it", () => {
    // A house often knows its size before it knows its type or its age, and a
    // blank column must not throw away every comp.
    const result = calculateArv([comp({ propertyType: "Townhouse", baths: 9, yearBuilt: 1800 })], 1_500);

    expect(result.excludedForFit).toHaveLength(0);
    expect(result.value).not.toBeNull();
  });

  it("skips a check the comp has no fact for", () => {
    const result = calculateArv(
      [comp({ propertyType: null, baths: null, yearBuilt: null })],
      1_500,
      { subjectPropertyType: "single_family", subjectBaths: 2, subjectYearBuilt: 1965 }
    );

    expect(result.excludedForFit).toHaveLength(0);
  });

  it("keeps each unreviewed comp's own hint", () => {
    const comps = [
      comp({ id: "g-1", externalId: "rc-g1", yearBuilt: 2020, review: "needs_review" }),
      comp({ id: "g-2", externalId: "rc-g2", yearBuilt: 2024, review: "needs_review" }),
    ];

    const result = calculateArv(comps, 1_500, { subjectYearBuilt: 1950 });

    expect(result.value).toBeNull();
    expect(result.compNotes[0].reasons[0]).toMatch(/^built 2020/);
    expect(result.compNotes[0].counted).toBe(false);
  });

  it("counts one house once, however many times it was listed", () => {
    // 2469 Romain Way came back as Atlanta and as East Point, same price and
    // same size, and both sat in the median.
    const comps = [
      comp({
        id: "d-1",
        externalId: "rc-d1",
        formattedAddress: "2469 Romain Way, Atlanta, GA 30311",
        sqft: 1_312,
        price: 225_000,
        daysOld: 30,
      }),
      comp({
        id: "d-2",
        externalId: "rc-d2",
        formattedAddress: "2469 Romain Way, East Point, GA 30344",
        sqft: 1_312,
        price: 225_000,
        daysOld: 90,
      }),
    ];

    const verdicts = assessComps(comps, 1_312);

    // The newer copy stays tickable; the older one starts unticked.
    expect(verdicts.get("d-1")!.passes).toBe(true);
    expect(verdicts.get("d-2")!.reasons).toEqual(["same house listed twice"]);
  });

  it("ignores the unit number when deciding it is the same house", () => {
    // 6721 Homer Ln arrived four times: bare, as Unit 73, and under two cities.
    const comps = [
      comp({ id: "h-1", externalId: "rc-h1", formattedAddress: "6721 Homer Ln, Fairburn, GA 30213", sqft: 2_013, daysOld: 40 }),
      comp({ id: "h-2", externalId: "rc-h2", formattedAddress: "6721 Homer Ln, Unit 73, Fairburn, GA 30213", sqft: 2_013, daysOld: 50 }),
      comp({ id: "h-3", externalId: "rc-h3", formattedAddress: "6721 Homer Ln, Unit 73, Atlanta, GA 30213", sqft: 2_013, daysOld: 60 }),
      comp({ id: "h-4", externalId: "rc-h4", formattedAddress: "6721 Homer Ln, Atlanta, GA 30213", sqft: 2_013, daysOld: 70 }),
    ];

    const verdicts = assessComps(comps, 2_013);

    expect(verdicts.get("h-1")!.passes).toBe(true);
    for (const id of ["h-2", "h-3", "h-4"]) {
      expect(verdicts.get(id)!.reasons).toEqual(["same house listed 4 times"]);
    }
  });

  it("keeps the most recent copy, whatever order they arrive in", () => {
    const comps = [
      comp({ id: "o-1", externalId: "rc-o1", formattedAddress: "5 Elm St, Atlanta, GA 30310", sqft: 1_200, daysOld: 200 }),
      comp({ id: "o-2", externalId: "rc-o2", formattedAddress: "5 Elm St, Atlanta, GA 30310", sqft: 1_200, daysOld: 10 }),
    ];

    const verdicts = assessComps(comps, 1_200);
    expect(verdicts.get("o-2")!.passes).toBe(true);
    expect(verdicts.get("o-1")!.reasons).toEqual(["same house listed twice"]);
  });

  it("falls back to the last date seen when neither copy knows its age", () => {
    const comps = [
      comp({ id: "n-1", externalId: "rc-n1", formattedAddress: "7 Oak St, Atlanta, GA 30310", sqft: 1_200, daysOld: null, lastSeenDate: "2026-01-05" }),
      comp({ id: "n-2", externalId: "rc-n2", formattedAddress: "7 Oak St, Atlanta, GA 30310", sqft: 1_200, daysOld: null, lastSeenDate: "2026-09-30" }),
    ];

    const verdicts = assessComps(comps, 1_200);
    expect(verdicts.get("n-2")!.passes).toBe(true);
    expect(verdicts.get("n-1")!.reasons).toEqual(["same house listed twice"]);
  });

  it("keeps both when the same street address has two different sizes", () => {
    // A rebuild or a subdivided lot. Dropping a real comp is worse than
    // keeping a duplicate, so size has to match too.
    const comps = [
      comp({ id: "s-1", externalId: "rc-s1", formattedAddress: "9 Pine St, Atlanta, GA 30310", sqft: 1_200, price: 250_000 }),
      comp({ id: "s-2", externalId: "rc-s2", formattedAddress: "9 Pine St, Atlanta, GA 30310", sqft: 1_400, price: 300_000 }),
    ];

    const result = calculateArv(comps, 1_300);

    expect(result.usedComps).toHaveLength(2);
    expect(result.excludedForFit).toHaveLength(0);
  });

  it("reads as a sentence when every comp was the same house", () => {
    // "most are same house listed twice" is not English. The summary groups
    // the varied reasons, so this one needs a grouped form too.
    const comps = [
      comp({ id: "q-1", externalId: "rc-q1", formattedAddress: "3 Fir St, Atlanta, GA 30310", sqft: 9_000, daysOld: 10 }),
      comp({ id: "q-2", externalId: "rc-q2", formattedAddress: "3 Fir St, Unit 2, Atlanta, GA 30310", sqft: 9_000, daysOld: 20 }),
    ];

    // Subject is far smaller, so the surviving copy is excluded for size and
    // nothing is left — which is what makes the summary sentence show.
    const verdicts = assessComps(comps, 1_200);

    // Both fail: one for size, the other as the older copy of the same house.
    expect(verdicts.get("q-1")!.reasons).toContain("much bigger");
    expect(verdicts.get("q-2")!.reasons).toContain("same house listed twice");
  });

  it("never dedupes a comp with no size, because it cannot be sure", () => {
    const comps = [
      comp({ id: "u-1", externalId: "rc-u1", formattedAddress: "11 Ash St, Atlanta, GA 30310", sqft: null }),
      comp({ id: "u-2", externalId: "rc-u2", formattedAddress: "11 Ash St, Atlanta, GA 30310", sqft: null }),
    ];

    expect(calculateArv(comps, 1_200).excludedForFit).toHaveLength(0);
  });

  // ── Nominal transfers ─────────────────────────────────────────────────────

  it("treats a $1,000 recorded sale as paperwork, not a sale", () => {
    // 1794 Melrose Dr came back at $1,000 beside houses fetching $280,000.
    const comps = [
      comp({ id: "n-1", externalId: "rc-n1", status: "sold", price: 1_000, sqft: 1_200 }),
      ...["a", "b", "c"].map((k, i) =>
        comp({ id: `s-${k}`, externalId: `rc-${k}`, status: "sold", price: 280_000 + i, sqft: 1_200 })
      ),
    ];

    const verdicts = assessComps(comps, 1_200);

    expect(verdicts.get("n-1")!.nominalTransfer).toBe(true);
    expect(verdicts.get("n-1")!.reasons[0]).toBe(
      "likely a paperwork transfer, not a real sale ($1,000)"
    );
    expect(verdicts.get("s-a")!.nominalTransfer).toBe(false);
  });

  it("catches a transfer that is large but still a fraction of the street", () => {
    // $40,000 clears the flat floor, but it is a tenth of what sold nearby.
    const comps = [
      comp({ id: "n-1", externalId: "rc-n1", status: "sold", price: 40_000, sqft: 1_200 }),
      ...["a", "b", "c"].map((k, i) =>
        comp({ id: `s-${k}`, externalId: `rc-${k}`, status: "sold", price: 400_000 + i, sqft: 1_200 })
      ),
    ];

    expect(assessComps(comps, 1_200).get("n-1")!.nominalTransfer).toBe(true);
  });

  it("does not call an ordinary cheap sale a transfer", () => {
    const comps = ["a", "b", "c"].map((k, i) =>
      comp({ id: `s-${k}`, externalId: `rc-${k}`, status: "sold", price: 200_000 + i * 10_000, sqft: 1_200 })
    );

    expect([...assessComps(comps, 1_200).values()].every((v) => !v.nominalTransfer)).toBe(true);
  });

  it("keeps a ticked transfer in the number but out of the nearby range", () => {
    // The owner's tick wins. "Similar homes nearby: $1,000-$280,002" would
    // describe no street that exists, so the range still leaves it out.
    const comps = [
      comp({ id: "n-1", externalId: "rc-n1", status: "sold", price: 1_000, sqft: 1_200, included: true }),
      ...["a", "b", "c"].map((k, i) =>
        comp({ id: `s-${k}`, externalId: `rc-${k}`, status: "sold", price: 280_000 + i, sqft: 1_200, included: true })
      ),
    ];

    const result = calculateArv(comps, 1_200);

    expect(result.usedComps.map((c) => c.compId)).toContain("n-1");
    expect(result.nearbyLow).toBe(280_000);
  });

  // ── The fixer-upper flag ──────────────────────────────────────────────────

  it("never flags a sale at or above what the counted comps fetched", () => {
    // 1740 Langston Ave at $462,000, bought by a company, is the most
    // expensive sale in the set and obviously not a fixer.
    const comps = [
      comp({ id: "f-1", externalId: "rc-f1", status: "sold", price: 462_000, sqft: 1_200,
             buyerType: "Organization", buyerName: "SOME LLC", included: true }),
      comp({ id: "f-2", externalId: "rc-f2", status: "sold", price: 280_000, sqft: 1_200, included: true }),
      comp({ id: "f-3", externalId: "rc-f3", status: "sold", price: 270_000, sqft: 1_200, included: true }),
    ];

    const result = calculateArv(comps, 1_200);

    expect(result.compNotes.find((n) => n.compId === "f-1")!.fixerUpper).toBe(false);
  });

  it("flags a company purchase below the counted median", () => {
    const comps = [
      comp({ id: "f-1", externalId: "rc-f1", status: "sold", price: 240_000, sqft: 1_200,
             buyerType: "Organization", buyerName: "SOME LLC", included: true }),
      comp({ id: "f-2", externalId: "rc-f2", status: "sold", price: 280_000, sqft: 1_200, included: true }),
      comp({ id: "f-3", externalId: "rc-f3", status: "sold", price: 300_000, sqft: 1_200, included: true }),
    ];

    const result = calculateArv(comps, 1_200);

    expect(result.compNotes.find((n) => n.compId === "f-1")!.fixerUpper).toBe(true);
  });

  it("does not flag a comp that is not counted", () => {
    const comps = [
      comp({ id: "f-1", externalId: "rc-f1", status: "sold", price: 90_000, sqft: 1_200,
             buyerType: "Organization", review: "not_renovated_skip" }),
      comp({ id: "f-2", externalId: "rc-f2", status: "sold", price: 280_000, sqft: 1_200, included: true }),
      comp({ id: "f-3", externalId: "rc-f3", status: "sold", price: 300_000, sqft: 1_200, included: true }),
    ];

    const result = calculateArv(comps, 1_200);

    expect(result.compNotes.find((n) => n.compId === "f-1")!.fixerUpper).toBe(false);
  });

  // ── A removed listing's two prices ────────────────────────────────────────

  it("values a removed listing at what it sold for, not what it asked", () => {
    const comps = [
      comp({ id: "r-1", externalId: "rc-r1", status: "removed", sqft: 1_000,
             price: 348_560, salePrice: 335_000, saleDate: "2026-06-01" }),
    ];

    const result = calculateArv(comps, 1_000);

    expect(result.usedComps[0].price).toBe(335_000);
    expect(result.value).toBe(335_000);
  });

  it("keeps the listed price beside the sale price, never instead of it", () => {
    // Both are facts about the house and the card shows both.
    const c = comp({ status: "removed", price: 348_560, salePrice: 335_000 });

    expect(effectivePrice(c)).toBe(335_000);
    expect(c.price).toBe(348_560);
  });

  it("falls back to the listed price when no sale price was entered", () => {
    expect(effectivePrice(comp({ status: "active", price: 300_000 }))).toBe(300_000);
  });

  it("offers Took off market only on a removed listing", () => {
    // A recorded sale closed and an active listing has not finished yet, so
    // the option would be an answer that cannot be true.
    expect(compReviewOptions("removed", "needs_review")).toContain("took_off_market_skip");
    expect(compReviewOptions("sold", "needs_review")).not.toContain("took_off_market_skip");
    expect(compReviewOptions("active", "needs_review")).not.toContain("took_off_market_skip");
  });

  it("does not count a comp taken off the market", () => {
    const comps = [
      comp({ id: "k-1", externalId: "rc-k1", sqft: 1_000, price: 300_000 }),
      comp({ id: "k-2", externalId: "rc-k2", sqft: 1_000, price: 900_000,
             status: "removed", review: "took_off_market_skip" }),
    ];

    const result = calculateArv(comps, 1_000);

    expect(result.usedComps.map((c) => c.compId)).toEqual(["k-1"]);
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

describe("a comp taken off the market", () => {
  /**
   * `took_off_market_skip` shipped with the sale-price migration and never
   * reached either of the two hardcoded arrays that decided what "skipped"
   * meant. A comp marked that way matched no filter but All — not Needs
   * review, not Approved, not Skipped — so it simply vanished from the tab.
   */
  it("counts as skipped", () => {
    expect(isSkipped("took_off_market_skip")).toBe(true);
  });

  it("shows under the Skipped filter", () => {
    const taken = comp({
      id: "off-1",
      status: "removed",
      review: "took_off_market_skip",
    });

    expect(matchesFilter(taken, undefined, "skipped")).toBe(true);
  });

  /**
   * The rule that keeps this from happening a third time: the three filters
   * that divide the work are exhaustive and do not overlap, so every review
   * state lands in exactly one of them.
   */
  it("leaves no review state outside the three work filters", () => {
    const work: CompFilter[] = ["needs_review", "approved", "skipped"];

    for (const review of COMP_REVIEW_ORDER) {
      const subject = comp({ id: `work-${review}`, status: "removed", review });
      const matched = work.filter((filter) => matchesFilter(subject, undefined, filter));

      expect({ review, matched }).toEqual({ review, matched: [expect.any(String)] });
    }
  });
});

describe("comparedToSubject", () => {
  /**
   * The owner answers "is this one like mine?" eleven times in a row. Pinning
   * their own specs to the top of the screen left them doing the subtraction
   * by hand, eleven times, which is what this replaces.
   */
  const subject = { beds: 3, baths: 2, sqft: 1_200, yearBuilt: 1930 };

  it("says how a comp differs from the house being bought", () => {
    const nearby = comp({ id: "d-1", beds: 3, baths: 2, sqft: 1_350, yearBuilt: 1950 });

    expect(comparedToSubject(nearby, subject)).toBe(
      "same beds, 150 sq ft bigger, 20 years newer"
    );
  });

  it("says smaller and older the other way round", () => {
    const nearby = comp({ id: "d-2", beds: 2, baths: 1, sqft: 900, yearBuilt: 1910 });

    expect(comparedToSubject(nearby, subject)).toBe(
      "1 bed fewer, 1 bath fewer, 300 sq ft smaller, 20 years older"
    );
  });

  /** A hallway is not a difference. Calling it one makes every house differ. */
  it("treats a few dozen feet as the same size", () => {
    const nearby = comp({ id: "d-3", beds: 3, baths: 2, sqft: 1_240, yearBuilt: 1931 });

    expect(comparedToSubject(nearby, subject)).toBe(
      "same beds, about the same size, built around the same time"
    );
  });

  it("leaves out a fact the subject does not have", () => {
    const nearby = comp({ id: "d-4", beds: 3, baths: 2, sqft: 1_350, yearBuilt: 1950 });

    expect(comparedToSubject(nearby, { ...subject, sqft: null })).toBe(
      "same beds, 20 years newer"
    );
  });

  /** Nothing in common to compare is no line at all, not an empty one. */
  it("says nothing when there is nothing to compare", () => {
    const nearby = comp({ id: "d-5", beds: null, baths: null, sqft: null, yearBuilt: null });

    expect(comparedToSubject(nearby, subject)).toBeNull();
  });
});

describe("a house that cannot be judged", () => {
  /**
   * An active listing is an asking price and a pending one is an accepted
   * offer. Neither is evidence of what a finished house sells for, so neither
   * is reviewed and neither counts — they are context, not a chore.
   *
   * Every comp defaults to needs_review whatever its status, so without this
   * the owner was asked "was it fixed up like yours will be?" about a house
   * that has not sold. That is where "81 to go" came from.
   */
  it("knows which statuses can be judged", () => {
    expect(isReviewable("removed")).toBe(true);
    expect(isReviewable("sold")).toBe(true);
    expect(isReviewable("active")).toBe(false);
    expect(isReviewable("pending")).toBe(false);
  });

  it("offers no answers for a house still on the market", () => {
    expect(compReviewOptions("active", "needs_review")).toEqual([]);
    expect(compReviewOptions("pending", "needs_review")).toEqual([]);
  });

  /**
   * Returning nothing for an already-answered comp would leave it counting
   * with no control to change it: unreachable and live at the same time.
   */
  it("keeps the answers on a comp somebody already answered", () => {
    expect(compReviewOptions("active", "renovated_use")).toContain("needs_review");
  });

  it("does not count an unjudgeable house as work still to do", () => {
    const comps = [
      comp({ id: "w-1", status: "active", review: "needs_review", sqft: 1_000, price: 300_000 }),
      comp({ id: "w-2", status: "pending", review: "needs_review", sqft: 1_000, price: 300_000 }),
      comp({ id: "w-3", status: "removed", review: "needs_review", sqft: 1_000, price: 300_000 }),
    ];

    expect(calculateArv(comps, 1_000).stillToReview).toBe(1);
  });

  /**
   * The arithmetic has to agree with the screen. `approved` had no status
   * filter at all, so a row approved before this rule existed would have kept
   * counting, invisibly.
   */
  it("never counts an unjudgeable house, even if it was approved", () => {
    const comps = [
      comp({ id: "a-1", status: "active", review: "renovated_use", sqft: 1_000, price: 900_000 }),
      comp({ id: "a-2", status: "sold", review: "renovated_use", sqft: 1_000, price: 300_000 }),
    ];

    const result = calculateArv(comps, 1_000);

    expect(result.usedComps.map((c) => c.compId)).toEqual(["a-2"]);
    expect(result.value).toBe(300_000);
  });

  it("opens on Checked when nothing can be judged", () => {
    const comps = [
      comp({ id: "t-1", status: "active", review: "needs_review" }),
      comp({ id: "t-2", status: "pending", review: "needs_review" }),
    ];

    expect(defaultTab(comps)).toBe("done");
  });
});

describe("when the photos are gone", () => {
  /**
   * The old answers forced a guess between "it counts" and "leave it out"
   * when a removed listing had taken its photos down with it. Both move the
   * resale price on no evidence.
   */
  it("is offered on a removed listing and nowhere else", () => {
    expect(compReviewOptions("removed", "needs_review")).toContain("cant_tell_skip");
    expect(compReviewOptions("sold", "needs_review")).not.toContain("cant_tell_skip");
  });

  it("is a skip, without a second edit anywhere", () => {
    expect(COMP_REVIEW_SKIPS).toContain("cant_tell_skip");
    expect(isSkipped("cant_tell_skip")).toBe(true);
  });

  it("keeps the house out of the resale price", () => {
    const comps = [
      comp({ id: "c-1", status: "sold", review: "renovated_use", sqft: 1_000, price: 300_000 }),
      comp({ id: "c-2", status: "removed", review: "cant_tell_skip", sqft: 1_000, price: 900_000 }),
    ];

    expect(calculateArv(comps, 1_000).value).toBe(300_000);
  });

  /**
   * Four comps where two more were unreadable is a different number from four
   * out of six, and the owner should see that without going looking.
   */
  it("says how many could not be judged", () => {
    const comps = [
      comp({ id: "u-1", status: "sold", review: "renovated_use", sqft: 1_000, price: 300_000 }),
      comp({ id: "u-2", status: "removed", review: "cant_tell_skip", sqft: 1_000, price: 310_000 }),
      comp({ id: "u-3", status: "removed", review: "cant_tell_skip", sqft: 1_000, price: 320_000 }),
    ];

    const result = calculateArv(comps, 1_000);

    expect(result.unreadable).toBe(2);
    expect(result.basisLabel).toContain("2 had no photos left");
  });

  it("counts only that answer, not the other skips", () => {
    const comps = [
      comp({ id: "o-1", status: "sold", review: "renovated_use", sqft: 1_000, price: 300_000 }),
      comp({ id: "o-2", status: "removed", review: "not_renovated_skip", sqft: 1_000, price: 310_000 }),
      comp({ id: "o-3", status: "removed", review: "took_off_market_skip", sqft: 1_000, price: 320_000 }),
    ];

    const result = calculateArv(comps, 1_000);

    expect(result.unreadable).toBe(0);
    expect(result.basisLabel).not.toContain("no photos left");
  });
});
