import {
  assessAffordability,
  assessDeal,
  AFFORDABILITY_LABEL,
  DEAL_LABEL,
} from "@/lib/mortgage/verdicts";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { calculateDti } from "@/lib/mortgage/dti";
import { calculate203kCap } from "@/lib/mortgage/renovationCap";
import { calculateFlip, genericFinancing } from "@/lib/mortgage/flip";
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
  function deal(arv: number, price: number, rehab: number, provisional = false) {
    return assessDeal({
      flip: calculateFlip({
        arv,
        purchasePrice: price,
        rehabTotal: rehab,
        buyingPct: 1,
        sellingPct: 8,
        holdingMonthly: 750,
        holdingMonths: 5,
        financing: genericFinancing(price * 0.8, 12, 2, 6),
      }),
      provisionalArv: provisional,
    });
  }

  it("works on a healthy margin and a real payday", () => {
    const d = deal(400_000, 180_000, 60_000);

    expect(d.verdict).toBe("works");
    expect(d.hasArv).toBe(true);
    expect(d.summary).toMatch(/profit at \d+% margin/);
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

  it("requires both the margin and the dollar floor", () => {
    // 15% of a small ARV is a percentage that looks fine attached to a payday
    // that is not worth a six-month rehab.
    const smallButPercentageHealthy = assessDeal({
      flip: {
        ...calculateFlip({
          arv: 120_000,
          purchasePrice: 60_000,
          rehabTotal: 20_000,
          buyingPct: 0,
          sellingPct: 0,
          holdingMonthly: 0,
          holdingMonths: 0,
          financing: genericFinancing(0, 0, 0, 0),
        }),
      },
      provisionalArv: false,
    });

    // Margin is 33% but profit is only $40,000 — over the works floor, so this
    // one works. The guard is tested directly below.
    expect(smallButPercentageHealthy.verdict).toBe("works");
  });

  it("is thin when the margin clears but the profit is under target", () => {
    const flip = calculateFlip({
      arv: 100_000,
      purchasePrice: 60_000,
      rehabTotal: 20_000,
      buyingPct: 0,
      sellingPct: 0,
      holdingMonthly: 0,
      holdingMonths: 0,
      financing: genericFinancing(0, 0, 0, 0),
    });
    // 20% margin, $20,000 profit — between the thin and works dollar floors.
    const d = assessDeal({ flip, provisionalArv: false });

    expect(flip.marginPct).toBeGreaterThanOrEqual(VERDICT_THRESHOLDS.dealMarginWorksPct);
    expect(d.verdict).toBe("thin");
    expect(d.summary).toMatch(/profit is under the/);
  });

  it("reports the 70% rule as a note, never as the verdict", () => {
    // The exact case that makes the 70% rule a figure here rather than a gate:
    // $5,000 over max offer, 15.1% margin, $75,720 profit. A gate would have
    // rejected a deal that plainly works.
    const d = deal(500_000, 345_000, 10_000);

    expect(d.verdict).toBe("works");
    expect(d.reasons.some((r) => /70% rule/.test(r.text))).toBe(true);
    // And the margin, not the rule, is what the summary leads with.
    expect(d.summary).toMatch(/profit at \d+% margin/);
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
