import { calculateAffordability } from "@/lib/mortgage/affordability";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { pmiBandForLtv, suggestedPmiRate, ltvPercent } from "@/lib/mortgage/pmi";
import { defaultInputs } from "@/lib/mortgage/defaults";
import { type MortgageInputs } from "@/lib/mortgage/types";

function inputs(overrides: Partial<MortgageInputs> = {}): MortgageInputs {
  return { ...defaultInputs(new Date(2025, 0, 1)), ...overrides };
}

describe("PMI bands", () => {
  it("charges nothing at 80% LTV or below", () => {
    expect(pmiBandForLtv(80)).toBeNull();
    expect(pmiBandForLtv(75)).toBeNull();
    expect(suggestedPmiRate(80)).toBe(0);
  });

  it("moves to a higher band as LTV rises", () => {
    const low = suggestedPmiRate(82);
    const mid = suggestedPmiRate(92);
    const high = suggestedPmiRate(96.5);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it("returns a rate inside the band it reports", () => {
    const band = pmiBandForLtv(92)!;
    const rate = suggestedPmiRate(92);
    expect(rate).toBeGreaterThanOrEqual(band.low);
    expect(rate).toBeLessThanOrEqual(band.high);
  });

  it("uses the top of the band when asked to be conservative", () => {
    const band = pmiBandForLtv(92)!;
    expect(suggestedPmiRate(92, true)).toBe(band.high);
    expect(suggestedPmiRate(92, true)).toBeGreaterThan(suggestedPmiRate(92));
  });

  it("computes LTV from loan and value", () => {
    expect(ltvPercent(285000, 300000)).toBeCloseTo(95, 6);
    expect(ltvPercent(0, 0)).toBe(0);
  });
});

describe("auto PMI rate", () => {
  it("derives the rate from LTV when auto", () => {
    const auto = calculateMortgage(inputs({ homeValue: 300000, downPayment: 15000 }));
    const expected = suggestedPmiRate(ltvPercent(285000, 300000));
    expect(auto.monthlyMortgageInsurance).toBeCloseTo((285000 * (expected / 100)) / 12, 6);
  });

  it("uses the typed rate when the user has overridden it", () => {
    const manual = calculateMortgage(
      inputs({ homeValue: 300000, downPayment: 15000, pmiRate: 0.9, pmiRateAuto: false })
    );
    expect(manual.monthlyMortgageInsurance).toBeCloseTo((285000 * 0.009) / 12, 6);
  });
});

describe("affordability", () => {
  it("does not apply to hard money or DSCR", () => {
    for (const loanType of ["hardMoney", "dscr"] as const) {
      expect(calculateAffordability(inputs({ loanType })).applicable).toBe(false);
    }
  });

  it("returns nothing useful without income", () => {
    const r = calculateAffordability(inputs({ grossMonthlyIncome: 0 }));
    expect(r.maxPurchasePrice).toBe(0);
  });

  it("produces a price whose housing payment lands at or under the cap", () => {
    const i = inputs({ grossMonthlyIncome: 9000, otherMonthlyDebt: 600 });
    const r = calculateAffordability(i);

    expect(r.maxPurchasePrice).toBeGreaterThan(0);

    // Re-run the full calculator at the solved price and confirm the payment fits.
    const at = calculateMortgage({
      ...i,
      homeValue: r.maxPurchasePrice,
      downPayment: r.downPayment,
      loanAmountOverride: null,
      propertyTaxYearly: (r.maxPurchasePrice * i.propertyTaxYearly) / i.homeValue,
    });
    expect(at.totalMonthlyWithMortgageInsurance).toBeLessThanOrEqual(r.maxHousingPayment + 1);
  });

  it("names the back-end ratio when other debt is what binds", () => {
    const r = calculateAffordability(inputs({ grossMonthlyIncome: 9000, otherMonthlyDebt: 2500 }));
    expect(r.binding).toBe("back");
  });

  it("names the front-end ratio when there is no other debt", () => {
    const r = calculateAffordability(inputs({ grossMonthlyIncome: 9000, otherMonthlyDebt: 0 }));
    expect(r.binding).toBe("front");
  });

  it("falls as other monthly debt rises", () => {
    const none = calculateAffordability(inputs({ grossMonthlyIncome: 9000, otherMonthlyDebt: 0 }));
    const lots = calculateAffordability(inputs({ grossMonthlyIncome: 9000, otherMonthlyDebt: 2500 }));
    expect(lots.maxPurchasePrice).toBeLessThan(none.maxPurchasePrice);
  });

  it("rises with income", () => {
    const lower = calculateAffordability(inputs({ grossMonthlyIncome: 6000 }));
    const higher = calculateAffordability(inputs({ grossMonthlyIncome: 12000 }));
    expect(higher.maxPurchasePrice).toBeGreaterThan(lower.maxPurchasePrice);
  });

  it("rounds to the nearest $500 rather than implying false precision", () => {
    const r = calculateAffordability(inputs({ grossMonthlyIncome: 9137 }));
    expect(r.maxPurchasePrice % 500).toBe(0);
  });

  it("is more conservative than a midpoint PMI assumption would be", () => {
    // Top-of-band mortgage insurance costs more, so the affordable price is lower.
    const i = inputs({ grossMonthlyIncome: 9000, otherMonthlyDebt: 0, downPayment: 350000 * 0.05 });
    const r = calculateAffordability(i);
    const atPrice = calculateMortgage({
      ...i,
      homeValue: r.maxPurchasePrice,
      downPayment: r.downPayment,
      loanAmountOverride: null,
      propertyTaxYearly: (r.maxPurchasePrice * i.propertyTaxYearly) / i.homeValue,
    });
    // The calculator's own (midpoint) payment must fit inside the conservative cap.
    expect(atPrice.totalMonthlyWithMortgageInsurance).toBeLessThanOrEqual(r.maxHousingPayment + 1);
  });
});
