import {
  assessAffordability,
  assessDeal,
  AFFORDABILITY_LABEL,
  DEAL_LABEL,
} from "@/lib/mortgage/verdicts";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { calculateDti } from "@/lib/mortgage/dti";
import { calculate203kCap } from "@/lib/mortgage/renovationCap";
import { calculateDeal, line, type DealParams } from "@/lib/mortgage/flip";
import { defaultInputs, VERDICT_THRESHOLDS } from "@/lib/mortgage/defaults";
import { type MortgageInputs } from "@/lib/mortgage/types";

/**
 * The two verdicts, against the thresholds in defaults.
 *
 * Each test moves one input across one line, so a failure names the rule that
 * broke rather than "the verdict changed".
 */

function inputs(overrides: Partial<MortgageInputs> = {}): MortgageInputs {
  return {
    ...defaultInputs(new Date(2026, 0, 1)),
    homeValue: 250_000,
    downPayment: 250_000 * 0.035,
    loanType: "fha",
    interestRate: 6.5,
    grossMonthlyIncome: 9_000,
    otherMonthlyDebt: 400,
    ...overrides,
  };
}

function affordability(
  over: Partial<MortgageInputs> = {},
  opts: { cashAvailable?: number; countyLoanLimit?: number | null } = {}
) {
  const i = inputs(over);
  const result = calculateMortgage(i);
  return assessAffordability({
    inputs: i,
    result,
    dti: calculateDti(i, result),
    renovationCap: i.renovationProgram === "none" ? null : calculate203kCap(i),
    cashAvailable: opts.cashAvailable ?? 100_000,
    countyLoanLimit: opts.countyLoanLimit ?? null,
  });
}

describe("affordability — the empty-profile state", () => {
  it("asks for income rather than judging against zero", () => {
    const a = affordability({ grossMonthlyIncome: 0 });

    // A verdict computed against an income nobody entered is a confident
    // answer to a question nobody asked.
    expect(a.needsProfile).toBe(true);
    expect(a.summary).toBe("Set your income");
  });

  it("does not claim to qualify with no income", () => {
    expect(affordability({ grossMonthlyIncome: 0 }).verdict).not.toBe("qualifies");
  });
});

describe("affordability — qualifying", () => {
  it("qualifies on comfortable numbers", () => {
    const a = affordability({ grossMonthlyIncome: 14_000, otherMonthlyDebt: 200 });

    expect(a.verdict).toBe("qualifies");
    expect(a.reasons).toHaveLength(0);
    expect(a.summary).toBe("Within your ratios and cash");
  });
});

describe("affordability — hard stops", () => {
  it("fails when the back-end ratio is well over the guideline", () => {
    const a = affordability({ grossMonthlyIncome: 3_000, otherMonthlyDebt: 1_500 });

    expect(a.verdict).toBe("does_not_qualify");
    expect(a.reasons.some((r) => r.kind === "blocker" && /debt ratio/.test(r.text))).toBe(true);
  });

  it("fails when cash to close exceeds cash available, and says both figures", () => {
    const a = affordability({ grossMonthlyIncome: 14_000 }, { cashAvailable: 500 });

    expect(a.verdict).toBe("does_not_qualify");
    const reason = a.reasons.find((r) => /at closing/.test(r.text));
    expect(reason?.kind).toBe("blocker");
    // Both numbers, because "not enough cash" without them is unactionable.
    expect(reason?.text).toMatch(/\$[\d,]+ at closing, \$500 available/);
  });

  it("fails when the loan is over the county limit", () => {
    const a = affordability({ grossMonthlyIncome: 14_000 }, { countyLoanLimit: 100_000 });

    expect(a.verdict).toBe("does_not_qualify");
    expect(a.reasons.some((r) => /county limit/.test(r.text))).toBe(true);
  });

  it("counts the 203(k) out-of-pocket gap as part of cash to close", () => {
    // The gap must be able to trip the cash stop rather than only being
    // displayed somewhere else on the page.
    const withGap = affordability(
      {
        grossMonthlyIncome: 14_000,
        renovationProgram: "fha203k",
        renovationBudget: 50_000,
        afterRepairValue: 220_000,
      },
      { cashAvailable: 15_000 }
    );

    expect(withGap.verdict).toBe("does_not_qualify");
    expect(withGap.reasons.some((r) => /at closing/.test(r.text))).toBe(true);
  });

  it("fails a Limited 203(k) over the rehab ceiling", () => {
    const i = inputs({
      grossMonthlyIncome: 14_000,
      renovationProgram: "fha203k",
      renovationBudget: 90_000,
      afterRepairValue: 600_000,
    });
    const result = calculateMortgage(i);
    const a = assessAffordability({
      inputs: i,
      result,
      dti: calculateDti(i, result),
      renovationCap: calculate203kCap(i, { isLimited: true }),
      cashAvailable: 500_000,
      countyLoanLimit: null,
    });

    expect(a.verdict).toBe("does_not_qualify");
    expect(a.reasons.some((r) => /Limited 203\(k\) ceiling/.test(r.text))).toBe(true);
  });

  it("puts the blocker first, so the summary is the most severe reason", () => {
    const a = affordability({ grossMonthlyIncome: 3_000, otherMonthlyDebt: 1_500 }, { cashAvailable: 100 });

    expect(a.reasons[0].kind).toBe("blocker");
    expect(a.summary).toBe(a.reasons[0].text);
  });
});

describe("affordability — tight", () => {
  it("is tight when a ratio is only just over the guideline", () => {
    // The caution band is shared with the ratio badges, so the badge and the
    // verdict cannot disagree about what "caution" means. At this income the
    // housing ratio is in caution and the total-debt ratio still passes.
    const i = inputs({ grossMonthlyIncome: 6_000, otherMonthlyDebt: 300 });
    const result = calculateMortgage(i);
    const dti = calculateDti(i, result);

    expect(dti.frontStatus).toBe("caution");
    expect(dti.backStatus).toBe("pass");

    const a = assessAffordability({
      inputs: i,
      result,
      dti,
      renovationCap: null,
      cashAvailable: 200_000,
      countyLoanLimit: null,
    });

    expect(a.verdict).toBe("tight");
    // Nothing fatal — a caution downgrades, it does not block.
    expect(a.reasons.every((r) => r.kind === "caution")).toBe(true);
    expect(a.reasons.some((r) => /Housing ratio/.test(r.text))).toBe(true);
  });

  it("is tight when almost no cash is left after closing", () => {
    const i = inputs({ grossMonthlyIncome: 14_000 });
    const result = calculateMortgage(i);
    // Just enough to close, nothing behind it.
    const a = assessAffordability({
      inputs: i,
      result,
      dti: calculateDti(i, result),
      renovationCap: null,
      cashAvailable: result.cashToClose + 100,
      countyLoanLimit: null,
    });

    expect(a.verdict).toBe("tight");
    expect(a.reasons.some((r) => /left after closing/.test(r.text))).toBe(true);
  });

  it("names the reserve threshold it is measuring against", () => {
    const i = inputs({ grossMonthlyIncome: 14_000 });
    const result = calculateMortgage(i);
    const a = assessAffordability({
      inputs: i,
      result,
      dti: calculateDti(i, result),
      renovationCap: null,
      cashAvailable: result.cashToClose + 100,
      countyLoanLimit: null,
    });

    expect(a.reasons.some((r) =>
      r.text.includes(`${VERDICT_THRESHOLDS.cashReservesTightMonths} months`)
    )).toBe(true);
  });
});

describe("deal", () => {
  /**
   * A cash purchase with the usual seller costs, so the verdict is exercised
   * through the figure it actually judges: true profit, not walk-away.
   *
   * Walk-away flatters a deal where a lot of cash went in, which is precisely
   * why the verdict does not read it.
   */
  function dealResult(opts: {
    arv: number;
    price: number;
    rehab: number;
    sellerPct?: number;
    carry?: number;
  }) {
    const { arv, price, rehab, sellerPct = 8, carry = 3_750 } = opts;
    const params: DealParams = {
      arv: arv > 0 ? line(arv, "valuation") : null,
      loanPayoff: line(0, "financing_analysis"),
      sellerClosingCosts: line(arv * (sellerPct / 100), "defaults"),
      dpaRepayment: line(0, "financing_analysis"),
      capitalGains: line(0, "manual"),
      otherFees: [],
      // All cash: the price and the rehab are both out of pocket.
      downPayment: line(price, "financing_analysis"),
      buyerClosingCosts: line(0, "financing_analysis"),
      points: line(0, "financing_analysis"),
      rehabPaidInCash: line(rehab, "rehab_budget"),
      loanShortfall: line(0, "computed"),
      holdMonths: 5,
      carry: line(carry, "financing_analysis"),
      monthlyExtras: line(0, "manual"),
      oneMoreMonthCarry: 0,
      purchasePrice: price,
      rehabTotal: rehab,
    };
    return calculateDeal(params);
  }

  function deal(arv: number, price: number, rehab: number, provisional = false) {
    return assessDeal({ deal: dealResult({ arv, price, rehab }), provisionalArv: provisional });
  }

  it("works on a healthy margin and a real payday", () => {
    const d = deal(400_000, 180_000, 60_000);

    expect(d.verdict).toBe("works");
    expect(d.hasArv).toBe(true);
    expect(d.summary).toMatch(/true profit at \d+% margin/);
  });

  it("does not work when the deal loses money, and says so plainly", () => {
    const d = deal(200_000, 190_000, 40_000);

    expect(d.verdict).toBe("does_not_work");
    expect(d.summary).toMatch(/^Loses \$/);
  });

  it("needs an ARV before it will judge anything", () => {
    const d = deal(0, 180_000, 60_000);

    expect(d.hasArv).toBe(false);
    expect(d.summary).toBe("No ARV yet");
  });

  it("is thin when the margin clears but the profit is under target", () => {
    // 20% margin on a $100,000 ARV is $20,000 — a percentage that looks fine
    // attached to a payday not worth a six-month rehab. Both tests have to
    // clear, and this is the one that catches it.
    const result = dealResult({
      arv: 100_000,
      price: 60_000,
      rehab: 20_000,
      sellerPct: 0,
      carry: 0,
    });
    const d = assessDeal({ deal: result, provisionalArv: false });

    expect(result.marginPct).toBeGreaterThanOrEqual(VERDICT_THRESHOLDS.dealMarginWorksPct);
    expect(result.trueProfit).toBeLessThan(VERDICT_THRESHOLDS.dealMinProfitWorks);
    expect(d.verdict).toBe("thin");
    expect(d.summary).toMatch(/true profit is under the/);
  });

  it("is thin when the dollars clear but the margin is under target", () => {
    // The mirror case: $32,250 is a real payday, but 10.8% of a $300,000 ARV
    // is too little room for a rehab to go wrong in.
    const result = dealResult({ arv: 300_000, price: 200_000, rehab: 40_000 });
    const d = assessDeal({ deal: result, provisionalArv: false });

    expect(result.trueProfit).toBeGreaterThanOrEqual(VERDICT_THRESHOLDS.dealMinProfitThin);
    expect(result.marginPct).toBeLessThan(VERDICT_THRESHOLDS.dealMarginWorksPct);
    expect(d.verdict).toBe("thin");
    expect(d.summary).toMatch(/margin is under the/);
  });

  it("judges true profit, not walk-away", () => {
    // Walk-away is large and positive while the deal itself loses money. A
    // verdict reading the headline figure would call this one a winner.
    const result = dealResult({ arv: 200_000, price: 190_000, rehab: 40_000 });

    expect(result.walkAwayCash).toBeGreaterThan(0);
    expect(result.trueProfit).toBeLessThan(0);
    expect(assessDeal({ deal: result, provisionalArv: false }).verdict).toBe("does_not_work");
  });

  it("reports the 70% rule as a note, never as the verdict", () => {
    // $5,000 over max offer on a deal that plainly works. A gate would have
    // rejected it; a note says so and lets the margin decide.
    const d = deal(500_000, 345_000, 10_000);

    expect(d.verdict).toBe("works");
    expect(d.reasons.some((r) => /70% rule/.test(r.text))).toBe(true);
    expect(d.summary).toMatch(/true profit at \d+% margin/);
  });

  it("carries the provisional flag through", () => {
    expect(deal(400_000, 180_000, 60_000, true).provisional).toBe(true);
    expect(deal(400_000, 180_000, 60_000, false).provisional).toBe(false);
  });
});

describe("labels", () => {
  it("reads as plain English", () => {
    expect(AFFORDABILITY_LABEL.does_not_qualify).toBe("Doesn't qualify");
    expect(DEAL_LABEL.does_not_work).toBe("Doesn't work");
  });
});
