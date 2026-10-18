import {
  calculateFlip,
  financingFromAnalysis,
  genericFinancing,
  type FlipFinancing,
} from "@/lib/mortgage/flip";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { defaultInputs, VERDICT_THRESHOLDS } from "@/lib/mortgage/defaults";
import { type MortgageInputs } from "@/lib/mortgage/types";

/**
 * The FlipperForce worked example, and the two financing sources.
 *
 * https://flipperforce.com/how-to-flip-houses/chapter-4-how-to-analyze-house-flip-deals/calculating-profit
 */

describe("calculateFlip — the FlipperForce $20,900 fixture", () => {
  // Purchase $95,000 · ARV $210,000 · repairs $65,000 · buying 1% ·
  // holding $750 × 5 months · financing 12% on $140,000 for 6 months.
  const financing = genericFinancing(140_000, 12, 0, 6);

  const base = {
    arv: 210_000,
    purchasePrice: 95_000,
    rehabTotal: 65_000,
    buyingPct: 1,
    holdingMonthly: 750,
    holdingMonths: 5,
    financing,
  };

  it("reproduces the published $20,900 profit from the published line items", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // FlipperForce's example is internally inconsistent, and this is where it
    // shows. It *states* "8% in Selling Costs" but *shows* a selling cost of
    // $16,000 — which is 7.619% of the $210,000 resale value, i.e. 8% of
    // $200,000. The $20,900 headline reconciles only with the $16,000 figure.
    //
    // So this test drives the dollar amount they actually used, expressed as
    // the rate it implies. The calculator is not bent to hit the headline; see
    // the next test for what a literal 8% produces.
    // ─────────────────────────────────────────────────────────────────────────
    const result = calculateFlip({ ...base, sellingPct: (16_000 / 210_000) * 100 });

    expect(result.buyingCosts).toBeCloseTo(950, 6);
    expect(result.holdingCosts).toBeCloseTo(3_750, 6);
    expect(result.financingCosts).toBeCloseTo(8_400, 6);
    expect(result.sellingCosts).toBeCloseTo(16_000, 6);
    expect(result.allInCost).toBeCloseTo(189_100, 6);
    expect(result.profit).toBeCloseTo(20_900, 6);
  });

  it("produces $20,100 at a literal 8% selling cost", () => {
    // Correct arithmetic on the stated percentage. Documented so nobody
    // 'fixes' the calculator later to make the headline match the percentage.
    const result = calculateFlip({ ...base, sellingPct: 8 });

    expect(result.sellingCosts).toBeCloseTo(16_800, 6);
    expect(result.profit).toBeCloseTo(20_100, 6);
  });

  it("derives margin, ROI and cash invested", () => {
    const result = calculateFlip({ ...base, sellingPct: (16_000 / 210_000) * 100 });

    expect(result.marginPct).toBeCloseTo((20_900 / 210_000) * 100, 6);

    // Cash invested excludes selling costs, which come out of the proceeds:
    // 95,000 + 65,000 + 950 + 3,750 + 8,400 − 140,000
    expect(result.cashInvested).toBeCloseTo(33_100, 6);
    expect(result.roiPct).toBeCloseTo((20_900 / 33_100) * 100, 6);
  });

  it("reports the 70% rule as a figure", () => {
    const result = calculateFlip({ ...base, sellingPct: 8 });

    // 210,000 × 70% − 65,000
    expect(result.maxOffer).toBeCloseTo(82_000, 6);
    // The $95,000 price is over it, and the deal still clears on margin —
    // which is exactly why the 70% rule is a figure here and not a gate.
    expect(result.overMaxOfferBy).toBeCloseTo(13_000, 6);
    expect(result.profit).toBeGreaterThan(0);
  });
});

describe("genericFinancing", () => {
  it("is interest-only across the hold, plus points", () => {
    const financing = genericFinancing(200_000, 12, 2, 6);

    expect(financing.source).toBe("generic_estimate");
    expect(financing.interest).toBeCloseTo(200_000 * 0.12 * (6 / 12), 6);
    expect(financing.points).toBeCloseTo(4_000, 6);
    expect(financing.total).toBeCloseTo(16_000, 6);
    // No mortgage insurance on hard money.
    expect(financing.upfrontMortgageInsurance).toBe(0);
    expect(financing.monthlyMortgageInsurance).toBe(0);
    expect(financing.analysisLabel).toBeNull();
  });

  it("charges nothing for a zero-month hold", () => {
    expect(genericFinancing(200_000, 12, 0, 0).total).toBe(0);
  });
});

describe("financingFromAnalysis", () => {
  function fhaInputs(overrides: Partial<MortgageInputs> = {}): MortgageInputs {
    return {
      ...defaultInputs(new Date(2026, 0, 1)),
      homeValue: 250_000,
      downPayment: 250_000 * 0.035,
      loanType: "fha",
      interestRate: 6.5,
      termYears: 30,
      ...overrides,
    };
  }

  it("takes interest and mortgage insurance from the real schedule", () => {
    const inputs = fhaInputs();
    const result = calculateMortgage(inputs);
    const financing = financingFromAnalysis(inputs, result, 6, "at asking");

    expect(financing.source).toBe("financing_analysis");
    expect(financing.analysisLabel).toBe("at asking");

    // Summed from the first six rows, not approximated from the opening balance.
    const expectedInterest = result.schedule
      .slice(0, 6)
      .reduce((sum, row) => sum + row.interest, 0);
    expect(financing.interest).toBeCloseTo(expectedInterest, 6);

    // FHA: UFMIP is a real cost, and the generic estimate misses it entirely.
    expect(financing.upfrontMortgageInsurance).toBeGreaterThan(0);
    expect(financing.upfrontMortgageInsurance).toBeCloseTo(result.ufmip ?? 0, 6);
    expect(financing.monthlyMortgageInsurance).toBeGreaterThan(0);

    expect(financing.total).toBeCloseTo(
      financing.interest +
        financing.upfrontMortgageInsurance +
        financing.monthlyMortgageInsurance +
        financing.points,
      6
    );
  });

  it("costs materially more than the generic estimate on an FHA loan", () => {
    // The reason the source has to be shown on the breakdown: the two differ by
    // thousands, so a number whose origin is invisible is a number nobody can
    // check.
    const inputs = fhaInputs();
    const result = calculateMortgage(inputs);

    const fromAnalysis = financingFromAnalysis(inputs, result, 6, "at asking");
    const generic = genericFinancing(result.loanAmount, inputs.interestRate, 0, 6);

    expect(fromAnalysis.total).toBeGreaterThan(generic.total);
    expect(fromAnalysis.total - generic.total).toBeGreaterThan(1_000);
  });

  it("charges nothing for a zero-month hold", () => {
    const inputs = fhaInputs();
    const result = calculateMortgage(inputs);
    const financing = financingFromAnalysis(inputs, result, 0, "at asking");

    expect(financing.interest).toBe(0);
    expect(financing.monthlyMortgageInsurance).toBe(0);
    // UFMIP is charged at closing regardless of how long the hold runs.
    expect(financing.upfrontMortgageInsurance).toBeGreaterThan(0);
  });

  it("feeds calculateFlip and keeps its source visible on the result", () => {
    const inputs = fhaInputs();
    const result = calculateMortgage(inputs);
    const financing = financingFromAnalysis(inputs, result, 6, "at asking");

    const flip = calculateFlip({
      arv: 400_000,
      purchasePrice: 250_000,
      rehabTotal: 40_000,
      buyingPct: 1,
      sellingPct: 8,
      holdingMonthly: 750,
      holdingMonths: 6,
      financing,
    });

    expect(flip.financing.source).toBe("financing_analysis");
    expect(flip.financing.analysisLabel).toBe("at asking");
    expect(flip.financingCosts).toBeCloseTo(financing.total, 6);
  });
});

describe("calculateFlip — edges", () => {
  const noFinancing: FlipFinancing = genericFinancing(0, 0, 0, 0);

  it("returns a null margin with no ARV rather than dividing by zero", () => {
    const result = calculateFlip({
      arv: 0,
      purchasePrice: 95_000,
      rehabTotal: 65_000,
      buyingPct: 1,
      sellingPct: 8,
      holdingMonthly: 750,
      holdingMonths: 5,
      financing: noFinancing,
    });

    expect(result.marginPct).toBeNull();
    expect(result.maxOffer).toBe(0);
    expect(result.profit).toBeLessThan(0);
  });

  it("reports a negative profit rather than clamping it to zero", () => {
    // A deal that loses money has to be able to say so.
    const result = calculateFlip({
      arv: 150_000,
      purchasePrice: 140_000,
      rehabTotal: 40_000,
      buyingPct: 1,
      sellingPct: 8,
      holdingMonthly: 750,
      holdingMonths: 6,
      financing: genericFinancing(100_000, 12, 2, 6),
    });

    expect(result.profit).toBeLessThan(0);
    expect(result.marginPct).toBeLessThan(0);
  });

  it("never offers a negative max offer", () => {
    const result = calculateFlip({
      arv: 100_000,
      purchasePrice: 90_000,
      rehabTotal: 95_000,
      buyingPct: 1,
      sellingPct: 8,
      holdingMonthly: 0,
      holdingMonths: 0,
      financing: noFinancing,
    });

    // 100,000 × 70% − 95,000 is negative; a negative offer is not a thing.
    expect(result.maxOffer).toBe(0);
  });

  it("reads the 70% factor from the shared thresholds", () => {
    const result = calculateFlip({
      arv: 200_000,
      purchasePrice: 100_000,
      rehabTotal: 0,
      buyingPct: 0,
      sellingPct: 0,
      holdingMonthly: 0,
      holdingMonths: 0,
      financing: noFinancing,
    });

    expect(result.maxOffer).toBeCloseTo(
      200_000 * (VERDICT_THRESHOLDS.maxOfferArvPct / 100),
      6
    );
  });
});
