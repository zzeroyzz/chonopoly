import {
  calculate203kCap,
  AFTER_IMPROVED_VALUE_FACTOR,
  PURCHASE_LTV_FACTOR,
  LIMITED_203K_REHAB_CEILING,
} from "@/lib/mortgage/renovationCap";
import { defaultInputs } from "@/lib/mortgage/defaults";
import { type MortgageInputs } from "@/lib/mortgage/types";

/**
 * HUD Handbook 4000.1 II.A.8.a, as amended by ML 2024-13.
 * https://www.hud.gov/sites/dfiles/OCHCO/documents/2024-13hsgml.pdf
 */

function renoInputs(overrides: Partial<MortgageInputs> = {}): MortgageInputs {
  return {
    ...defaultInputs(new Date(2026, 0, 1)),
    loanType: "fha",
    renovationProgram: "fha203k",
    homeValue: 200_000,
    renovationBudget: 50_000,
    renovationContingencyPct: 10,
    afterRepairValue: 300_000,
    downPayment: 0,
    ...overrides,
  };
}

describe("calculate203kCap — applicability", () => {
  it("does not apply without a renovation program", () => {
    const result = calculate203kCap(renoInputs({ renovationProgram: "none" }));

    expect(result.applicable).toBe(false);
    expect(result.fits).toBe(true);
    expect(result.outOfPocketGap).toBe(0);
  });

  it("does not apply with a zero rehab budget", () => {
    expect(calculate203kCap(renoInputs({ renovationBudget: 0 })).applicable).toBe(false);
  });
});

describe("calculate203kCap — the two HUD limits", () => {
  it("binds on the cost basis when the ARV is generous", () => {
    // Rehab + contingency = 55,000. Cost basis = 200,000 + 55,000 = 255,000.
    // After-improved ceiling = 110% × 500,000 = 550,000, so the basis binds.
    const result = calculate203kCap(renoInputs({ afterRepairValue: 500_000 }));

    expect(result.costBasis).toBeCloseTo(255_000, 6);
    expect(result.boundBy).toBe("cost_basis");
    expect(result.maximumMortgage).toBeCloseTo(255_000 * PURCHASE_LTV_FACTOR, 6);
  });

  it("binds on 110% of the after-improved value when that is lower", () => {
    // Cost basis = 200,000 + 55,000 = 255,000.
    // After-improved ceiling = 110% × 220,000 = 242,000, which is lower.
    const result = calculate203kCap(renoInputs({ afterRepairValue: 220_000 }));

    expect(result.afterImprovedCap).toBeCloseTo(242_000, 6);
    expect(result.boundBy).toBe("after_improved_value");
    expect(result.maximumMortgage).toBeCloseTo(242_000 * PURCHASE_LTV_FACTOR, 6);
  });

  it("applies the 110% factor from the published constant", () => {
    const result = calculate203kCap(renoInputs({ afterRepairValue: 220_000 }));

    expect(result.afterImprovedCap).toBeCloseTo(220_000 * AFTER_IMPROVED_VALUE_FACTOR, 6);
  });

  it("uses 100% of after-improved value for a condo", () => {
    const result = calculate203kCap(renoInputs({ afterRepairValue: 220_000 }), { isCondo: true });

    expect(result.afterImprovedCap).toBeCloseTo(220_000, 6);
    expect(result.boundBy).toBe("after_improved_value");
  });

  it("takes the lesser of as-is value and purchase price", () => {
    // HUD's rule. An as-is value under the price lowers the basis.
    const result = calculate203kCap(renoInputs({ afterRepairValue: 500_000 }), {
      asIsValue: 180_000,
    });

    expect(result.costBasis).toBeCloseTo(180_000 + 55_000, 6);
  });

  it("ignores an as-is value above the purchase price", () => {
    const result = calculate203kCap(renoInputs({ afterRepairValue: 500_000 }), {
      asIsValue: 260_000,
    });

    expect(result.costBasis).toBeCloseTo(200_000 + 55_000, 6);
  });

  it("falls back to the purchase price when the as-is value is unknown", () => {
    const withoutAsIs = calculate203kCap(renoInputs({ afterRepairValue: 500_000 }));
    const withPriceAsIs = calculate203kCap(renoInputs({ afterRepairValue: 500_000 }), {
      asIsValue: 200_000,
    });

    expect(withoutAsIs.costBasis).toBeCloseTo(withPriceAsIs.costBasis, 6);
  });

  it("notes that no cap was applied when there is no ARV", () => {
    const result = calculate203kCap(renoInputs({ afterRepairValue: null }));

    expect(result.boundBy).toBe("cost_basis");
    expect(result.notes.join(" ")).toMatch(/No after-repair value/);
  });
});

describe("calculate203kCap — the county loan limit", () => {
  it("caps the maximum mortgage and reports the county limit as binding", () => {
    const result = calculate203kCap(renoInputs({ afterRepairValue: 500_000 }), {
      countyLoanLimit: 200_000,
    });

    expect(result.maximumMortgage).toBeCloseTo(200_000, 6);
    expect(result.boundBy).toBe("county_limit");
  });

  it("leaves a generous county limit alone", () => {
    const result = calculate203kCap(renoInputs({ afterRepairValue: 500_000 }), {
      countyLoanLimit: 900_000,
    });

    expect(result.boundBy).toBe("cost_basis");
    expect(result.maximumMortgage).toBeCloseTo(255_000 * PURCHASE_LTV_FACTOR, 6);
  });
});

describe("calculate203kCap — the out-of-pocket gap", () => {
  it("is zero when the planned down payment already clears the cap", () => {
    // Max mortgage = 255,000 × 96.5% = 246,075.
    // Requested = 255,000 − 9,000 down = 246,000, which fits.
    const result = calculate203kCap(
      renoInputs({ afterRepairValue: 500_000, downPayment: 9_000 })
    );

    expect(result.outOfPocketGap).toBe(0);
    expect(result.fits).toBe(true);
  });

  it("is the shortfall when the project does not fit", () => {
    // Max mortgage = 110% × 220,000 × 96.5% = 233,530.
    // Requested = 255,000 − 0 down = 255,000. Gap = 21,470.
    const result = calculate203kCap(renoInputs({ afterRepairValue: 220_000 }));

    expect(result.maximumMortgage).toBeCloseTo(233_530, 6);
    expect(result.requestedLoan).toBeCloseTo(255_000, 6);
    expect(result.outOfPocketGap).toBeCloseTo(21_470, 6);
    expect(result.fits).toBe(false);
  });

  it("shrinks as the buyer puts more down", () => {
    const small = calculate203kCap(renoInputs({ afterRepairValue: 220_000, downPayment: 5_000 }));
    const large = calculate203kCap(renoInputs({ afterRepairValue: 220_000, downPayment: 15_000 }));

    expect(large.outOfPocketGap).toBeLessThan(small.outOfPocketGap);
    expect(small.outOfPocketGap - large.outOfPocketGap).toBeCloseTo(10_000, 6);
  });

  it("never goes negative", () => {
    const result = calculate203kCap(
      renoInputs({ afterRepairValue: 500_000, downPayment: 100_000 })
    );

    expect(result.outOfPocketGap).toBe(0);
  });

  it("includes the rehab contingency in the basis", () => {
    // The contingency is financed, so it counts against the cap. Omitting it
    // would understate the gap by the contingency amount.
    const noContingency = calculate203kCap(
      renoInputs({ afterRepairValue: 220_000, renovationContingencyPct: 0 })
    );
    const withContingency = calculate203kCap(
      renoInputs({ afterRepairValue: 220_000, renovationContingencyPct: 10 })
    );

    expect(withContingency.costBasis - noContingency.costBasis).toBeCloseTo(5_000, 6);
    expect(withContingency.outOfPocketGap).toBeGreaterThan(noContingency.outOfPocketGap);
  });
});

describe("calculate203kCap — the Limited 203(k) rehab ceiling", () => {
  it("is not applied to a Standard 203(k)", () => {
    const result = calculate203kCap(renoInputs({ renovationBudget: 90_000 }));

    expect(result.rehabCeiling).toBeNull();
    expect(result.rehabOverCeilingBy).toBe(0);
  });

  it("flags a Limited 203(k) over the $75,000 ceiling", () => {
    // 90,000 + 10% contingency = 99,000, which is 24,000 over.
    const result = calculate203kCap(renoInputs({ renovationBudget: 90_000 }), {
      isLimited: true,
    });

    expect(result.rehabCeiling).toBe(LIMITED_203K_REHAB_CEILING);
    expect(result.rehabOverCeilingBy).toBeCloseTo(24_000, 6);
    expect(result.fits).toBe(false);
    expect(result.notes.join(" ")).toMatch(/Standard 203\(k\)/);
  });

  it("passes a Limited 203(k) under the ceiling", () => {
    const result = calculate203kCap(
      renoInputs({ renovationBudget: 50_000, afterRepairValue: 500_000, downPayment: 9_000 }),
      { isLimited: true }
    );

    expect(result.rehabOverCeilingBy).toBe(0);
    expect(result.fits).toBe(true);
  });

  it("carries HUD's current $75,000 figure", () => {
    // ML 2024-13 raised this from $35,000 and HUD reviews it annually, so a
    // change here should be a deliberate edit with a fresh citation.
    expect(LIMITED_203K_REHAB_CEILING).toBe(75_000);
  });
});

describe("calculate203kCap — labelling", () => {
  it("always says it is an estimate", () => {
    const result = calculate203kCap(renoInputs());

    expect(result.notes.join(" ")).toMatch(/Estimate only/);
    expect(result.notes.join(" ")).toMatch(/worksheet/);
  });
});
