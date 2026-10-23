import {
  calculateDeal,
  line,
  payoffAfterMonths,
  type DealParams,
} from "@/lib/mortgage/flip";
import {
  sizeHardMoneyLoan,
  hardMoneyInterest,
  defaultDraws,
  HARD_MONEY_DEFAULTS,
  hardMoneyFees,
  type HardMoneyTerms,
} from "@/lib/mortgage/hardMoney";
import { resolveRehab, splitRehabFunding } from "@/lib/rehab/resolveRehab";
import { VERDICT_THRESHOLDS, defaultInputs } from "@/lib/mortgage/defaults";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { buildDeal, holdingFrom } from "@/lib/deal/buildDeal";
import { flipInputs, flipStartingTerms } from "@/lib/mortgage/flip";
import { type BuyerProfile } from "@/lib/profile/types";

/**
 * The deal calculation, against the owner's three worked examples.
 *
 * Rewritten from the FlipperForce fixture, which tested `calculateFlip` and its
 * single `profit = ARV − all-in cost`. That model is gone: it conflated the
 * money that lands at closing with what the deal actually made, and a deal
 * could look profitable while handing back less cash than went in.
 *
 * These figures are the ones checked by hand before the code was written.
 */

/** Everything zeroed, so each test states only the lines it cares about. */
function deal(over: Partial<DealParams> = {}): DealParams {
  return {
    arv: line(0, "valuation"),
    loanPayoff: line(0, "financing_analysis"),
    sellerClosingCosts: line(0, "defaults"),
    dpaRepayment: line(0, "financing_analysis"),
    capitalGains: line(0, "manual"),
    otherFees: [],
    downPayment: line(0, "financing_analysis"),
    buyerClosingCosts: line(0, "financing_analysis"),
    points: line(0, "financing_analysis"),
    rehabPaidInCash: line(0, "rehab_budget"),
    loanShortfall: line(0, "computed"),
    holdMonths: 12,
    carry: line(0, "financing_analysis"),
    monthlyExtras: line(0, "manual"),
    oneMoreMonthCarry: 0,
    purchasePrice: 0,
    rehabTotal: 0,
    ...over,
  };
}

describe("calculateDeal — the 203(k) worked example", () => {
  // ARV $250,000 · payoff overridden to $177,722 · seller closing $15,000 ·
  // DPA $10,000 · capital gains $12,000 → walk-away $35,278.
  // Cash in $2,085 · holding $20,532 → true profit $12,661.
  const base = deal({
    arv: line(250_000, "valuation"),
    loanPayoff: line(177_722, "financing_analysis", true),
    sellerClosingCosts: line(15_000, "defaults", true),
    dpaRepayment: line(10_000, "financing_analysis"),
    capitalGains: line(12_000, "manual", true),
    downPayment: line(2_085, "financing_analysis"),
    carry: line(20_532, "financing_analysis"),
  });

  it("walks away with $35,278", () => {
    expect(calculateDeal(base).walkAwayCash).toBeCloseTo(35_278, 6);
  });

  it("makes $12,661 after the cash in and the carry", () => {
    const r = calculateDeal(base);
    expect(r.cashIn).toBeCloseTo(2_085, 6);
    expect(r.holdingCost).toBeCloseTo(20_532, 6);
    expect(r.trueProfit).toBeCloseTo(12_661, 6);
  });

  it("separates what lands at closing from what the deal made", () => {
    // The whole reason this replaced a single profit figure.
    const r = calculateDeal(base);
    expect(r.walkAwayCash).toBeGreaterThan(r.trueProfit!);
  });
});

describe("hard money — the worked example", () => {
  // Purchase $200,000 · rehab $50,000 · ARV $325,000 · 15% · 2 points ·
  // 85% LTV · 100% rehab funded · Non-Dutch · draws of $25,000 in months 3
  // and 5 · 6 months · seller closing 6%.
  const terms: HardMoneyTerms = { ...HARD_MONEY_DEFAULTS };
  const loan = sizeHardMoneyLoan(200_000, 50_000, 325_000, terms);
  const draws = [
    { month: 3, amount: 25_000 },
    { month: 5, amount: 25_000 },
  ];
  const schedule = hardMoneyInterest(loan, terms, 6, draws);

  it("sizes the loan at $220,000, under the ARV ceiling", () => {
    expect(loan.total).toBeCloseTo(220_000, 6);
    expect(loan.arvCeiling).toBeCloseTo(243_750, 6);
    expect(loan.capped).toBe(false);
    expect(loan.shortfall).toBeCloseTo(0, 6);
  });

  it("puts $30,000 down and charges points on the funded loan", () => {
    expect(loan.downPayment).toBeCloseTo(30_000, 6);
    expect(loan.points).toBeCloseTo(4_400, 6);
  });

  it("charges Non-Dutch interest on the drawn balance only", () => {
    // A draw in month N is outstanding for month N.
    expect(schedule.rows.map((r) => Math.round(r.balance))).toEqual([
      170_000, 170_000, 195_000, 195_000, 220_000, 220_000,
    ]);
    expect(schedule.total).toBeCloseTo(14_625, 6);
  });

  it("costs more Dutch, because undrawn money is charged too", () => {
    const dutch = hardMoneyInterest(loan, { ...terms, interestStyle: "dutch" }, 6, draws);
    expect(dutch.total).toBeCloseTo(16_500, 6);
    expect(dutch.total).toBeGreaterThan(schedule.total);
  });

  it("walks away with $85,500 and makes $36,475", () => {
    const funding = splitRehabFunding(50_000, "hardMoney", "none", loan.rehabFunded);
    const r = calculateDeal(
      deal({
        arv: line(325_000, "valuation"),
        loanPayoff: line(loan.total, "hard_money_terms"),
        sellerClosingCosts: line(325_000 * 0.06, "defaults"),
        downPayment: line(loan.downPayment, "hard_money_terms"),
        points: line(loan.points, "hard_money_terms"),
        rehabPaidInCash: line(funding.inCash, "rehab_budget"),
        loanShortfall: line(loan.shortfall, "computed"),
        holdMonths: 6,
        carry: line(schedule.total, "hard_money_terms"),
        oneMoreMonthCarry: schedule.oneMoreMonth,
        purchasePrice: 200_000,
        rehabTotal: 50_000,
      })
    );

    expect(r.walkAwayCash).toBeCloseTo(85_500, 6);
    expect(r.cashIn).toBeCloseTo(34_400, 6);
    expect(r.holdingCost).toBeCloseTo(14_625, 6);
    expect(r.trueProfit).toBeCloseTo(36_475, 6);
  });

  it("turns an ARV ceiling into cash the buyer has to bring", () => {
    // A loan the ARV will not support is not a smaller loan — it is the same
    // deal with more of your own money in it.
    const capped = sizeHardMoneyLoan(300_000, 50_000, 300_000, terms);
    expect(capped.capped).toBe(true);
    expect(capped.arvCeiling).toBeCloseTo(225_000, 6);
    expect(capped.total).toBeCloseTo(225_000, 6);
    expect(capped.shortfall).toBeCloseTo(80_000, 6);
    // The ceiling trims the draws, never the advance wired at closing.
    expect(capped.purchaseAdvance).toBeCloseTo(225_000, 6);
    expect(capped.rehabFunded).toBeCloseTo(0, 6);
  });

  it("spreads draws over the first half of the hold by default", () => {
    const spread = defaultDraws(50_000, 6);
    expect(spread).toHaveLength(3);
    expect(spread.map((d) => d.month)).toEqual([1, 2, 3]);
    expect(spread.reduce((sum, d) => sum + d.amount, 0)).toBeCloseTo(50_000, 6);
  });

  it("has nothing to draw when the lender funds no rehab", () => {
    expect(defaultDraws(0, 6)).toEqual([]);
  });
});

describe("where the rehab money comes from", () => {
  it("finances the whole rehab on a renovation program", () => {
    expect(splitRehabFunding(30_000, "fha", "fha203k", null)).toEqual({
      inLoan: 30_000,
      inCash: 0,
    });
  });

  it("leaves the whole rehab in cash without one", () => {
    // The case people most often forget to budget for.
    expect(splitRehabFunding(30_000, "fha", "none", null)).toEqual({
      inLoan: 0,
      inCash: 30_000,
    });
  });

  it("splits it on hard money by what the lender actually funded", () => {
    expect(splitRehabFunding(50_000, "hardMoney", "none", 40_000)).toEqual({
      inLoan: 40_000,
      inCash: 10_000,
    });
  });
});

describe("resolveRehab", () => {
  it("falls back to the budget and says so", () => {
    const r = resolveRehab(null, 45_000);
    expect(r.total).toBe(45_000);
    expect(r.budgetOnly).toBe(true);
    expect(r.label).toBe("Budget only");
  });

  it("prefers an estimate and names its source", () => {
    expect(resolveRehab({ total: 52_000, source: "visit" }, 45_000)).toMatchObject({
      total: 52_000,
      source: "estimate_visit",
      budgetOnly: false,
    });
    expect(resolveRehab({ total: 52_000, source: "photos" }, 45_000).source).toBe(
      "estimate_photos"
    );
  });
});

describe("calculateDeal — edges", () => {
  it("returns null rather than $0 with no ARV", () => {
    // $0 reads as a deal that makes nothing; null reads as one nobody has
    // priced yet, and those are different answers.
    const r = calculateDeal(deal({ arv: null, downPayment: line(10_000, "financing_analysis") }));
    expect(r.walkAwayCash).toBeNull();
    expect(r.trueProfit).toBeNull();
    expect(r.marginPct).toBeNull();
    expect(r.maxOffer).toBeNull();
    expect(r.missingArv).toBe(true);
  });

  it("reports a loss rather than clamping it", () => {
    const r = calculateDeal(
      deal({
        arv: line(200_000, "valuation"),
        loanPayoff: line(190_000, "financing_analysis"),
        downPayment: line(40_000, "financing_analysis"),
      })
    );
    expect(r.walkAwayCash).toBeCloseTo(10_000, 6);
    expect(r.trueProfit).toBeCloseTo(-30_000, 6);
  });

  it("sums named fees and counts them against the walk-away", () => {
    const r = calculateDeal(
      deal({
        arv: line(100_000, "valuation"),
        otherFees: [
          { name: "Survey", amount: 900 },
          { name: "Lien release", amount: 350 },
        ],
      })
    );
    expect(r.otherFeesTotal).toBeCloseTo(1_250, 6);
    expect(r.walkAwayCash).toBeCloseTo(98_750, 6);
  });

  it("charges the monthly extras across the hold", () => {
    const r = calculateDeal(
      deal({
        arv: line(100_000, "valuation"),
        holdMonths: 6,
        carry: line(6_000, "financing_analysis"),
        monthlyExtras: line(250, "manual", true),
        oneMoreMonthCarry: 1_000,
      })
    );
    expect(r.holdingCost).toBeCloseTo(7_500, 6);
    // One more month is the carry plus the extras, which is the figure that
    // changes minds about a slipping rehab.
    expect(r.oneMoreMonth).toBeCloseTo(1_250, 6);
  });

  it("reads the 70% factor from the shared thresholds", () => {
    const r = calculateDeal(
      deal({ arv: line(300_000, "valuation"), rehabTotal: 50_000, purchasePrice: 220_000 })
    );
    const expected = 300_000 * (VERDICT_THRESHOLDS.maxOfferArvPct / 100) - 50_000;
    expect(r.maxOffer).toBeCloseTo(expected, 6);
    expect(r.overMaxOfferBy).toBeCloseTo(Math.max(0, 220_000 - expected), 6);
  });

  it("never offers a negative max offer", () => {
    const r = calculateDeal(deal({ arv: line(50_000, "valuation"), rehabTotal: 90_000 }));
    expect(r.maxOffer).toBe(0);
  });
});

describe("payoffAfterMonths", () => {
  it("subtracts the principal actually paid over the hold", () => {
    const schedule = Array.from({ length: 12 }, () => ({ principal: 500 }));
    expect(payoffAfterMonths(schedule, 200_000, 6)).toBeCloseTo(197_000, 6);
  });

  it("never returns a negative balance", () => {
    const schedule = Array.from({ length: 12 }, () => ({ principal: 5_000 }));
    expect(payoffAfterMonths(schedule, 10_000, 12)).toBe(0);
  });
});

// ── One hard money house, the same on every screen ───────────────────────────

describe("hard money, one house on every screen", () => {
  // $200,000 house, $50,000 of work, $400,000 resale price, 15% and 2 points.
  const inputs = {
    ...defaultInputs(),
    loanType: "hardMoney" as const,
    homeValue: 200_000,
    renovationBudget: 50_000,
    arv: 400_000,
    interestRate: 15,
    points: 2,
    propertyTaxYearly: 2_400,
    insuranceRateAuto: false,
    insuranceYearly: 1_200,
    hoaMonthly: 0,
  };
  const result = calculateMortgage(inputs);
  const house = {
    inputs,
    result,
    arv: 400_000,
    rehab: resolveRehab(null, 50_000),
    sellerClosingPct: 6,
  };

  it("Numbers and Deal size the same loan and the same down payment", () => {
    const deal = buildDeal(house);
    // 85% of $200,000 plus all $50,000 of work.
    expect(result.loanAmount).toBeCloseTo(220_000, 6);
    expect(deal.hardMoney?.loan.total).toBeCloseTo(220_000, 6);
    expect(result.downPaymentAmount).toBeCloseTo(30_000, 6);
    expect(deal.params.downPayment.value).toBeCloseTo(30_000, 6);
  });

  it("counts lender and title fees in closing, beside the points", () => {
    const deal = buildDeal(house);
    expect(deal.params.buyerClosingCosts.value).toBeCloseTo(hardMoneyFees(200_000, 2), 6);
    expect(deal.params.points.value).toBeCloseTo(4_400, 6);
  });

  it("adds tax and insurance to hard money's carry, every month held", () => {
    const deal = buildDeal(house, { holdMonths: 6 });
    const interestOnly = deal.hardMoney!.schedule.total;
    // $200 a month of tax and $100 of insurance, for six months.
    expect(deal.params.carry.value).toBeCloseTo(interestOnly + 300 * 6, 6);
    expect(deal.params.oneMoreMonthCarry).toBeCloseTo(deal.hardMoney!.schedule.oneMoreMonth + 300, 6);
  });

  it("uses Settings' holding cost and period when they are set", () => {
    const deal = buildDeal({ ...house, holding: { monthly: 750, months: 5 } });
    expect(deal.holdMonths).toBe(5);
    expect(deal.params.monthlyExtras.value).toBe(750);
    expect(deal.params.monthlyExtras.overridden).toBe(false);
  });

  it("falls back to the loan's default hold and no extras without Settings", () => {
    const deal = buildDeal(house);
    expect(deal.holdMonths).toBe(6);
    expect(deal.params.monthlyExtras.value).toBe(0);
  });

  it("lets a typed hold and extras win over Settings", () => {
    const deal = buildDeal({ ...house, holding: { monthly: 750, months: 5 } }, { holdMonths: 9, monthlyExtras: 100 });
    expect(deal.holdMonths).toBe(9);
    expect(deal.params.monthlyExtras.value).toBe(100);
  });

  it("sizes the loan before there is an ARV, rather than lending nothing", () => {
    const deal = buildDeal({ ...house, arv: null });
    expect(deal.hardMoney?.loan.total).toBeCloseTo(220_000, 6);
    expect(deal.hardMoney?.loan.capped).toBe(false);
  });

  it("reads Settings' holding figures from a profile", () => {
    expect(holdingFrom(null)).toBeNull();
    const defaults = { holdingMonthly: 750, holdingMonths: 5 } as BuyerProfile["defaults"];
    expect(holdingFrom(defaults)).toEqual({ monthly: 750, months: 5 });
  });
});

describe("the Flip calculator's inputs", () => {
  it("starts hard money on its own rate and points, with nothing typed down", () => {
    expect(flipStartingTerms("hardMoney")).toEqual({ ratePct: 15, pointsPct: 2, downPct: 0 });
  });

  it("starts a mortgage on the app's rate, no points and its minimum down", () => {
    const fha = flipStartingTerms("fha");
    expect(fha.pointsPct).toBe(0);
    expect(fha.downPct).toBe(3.5);
    expect(fha.ratePct).toBe(defaultInputs().interestRate);
  });

  it("works a mortgage down payment out from the price, not a fixed figure", () => {
    const inputs = flipInputs({
      product: "fha", price: 200_000, rehab: 50_000, arv: 325_000, ratePct: 6.75, pointsPct: 0, downPct: 3.5,
    });
    expect(inputs.downPayment).toBeCloseTo(7_000, 6);
  });

  it("includes the financed work on a renovation loan", () => {
    const inputs = flipInputs({
      product: "fha203k", price: 200_000, rehab: 50_000, arv: 325_000, ratePct: 6.75, pointsPct: 0, downPct: 3.5,
    });
    const work = 50_000 * (1 + inputs.renovationContingencyPct / 100);
    expect(inputs.downPayment).toBeCloseTo((200_000 + work) * 0.035, 6);
  });

  it("keeps every typed loan setting, which is what a save stores", () => {
    const inputs = flipInputs({
      product: "hardMoney", price: 180_000, rehab: 40_000, arv: 300_000, ratePct: 12, pointsPct: 3, downPct: 0,
    });
    expect(inputs).toMatchObject({
      loanType: "hardMoney",
      homeValue: 180_000,
      renovationBudget: 40_000,
      arv: 300_000,
      interestRate: 12,
      points: 3,
    });
  });
});
