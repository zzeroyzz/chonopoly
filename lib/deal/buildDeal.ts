import { type MortgageInputs, type MortgageResult } from "../mortgage/types";
import {
  calculateDeal,
  line,
  payoffAfterMonths,
  type DealParams,
  type DealResult,
  type OtherFee,
} from "../mortgage/flip";
import {
  sizeHardMoneyLoan,
  hardMoneyInterest,
  defaultDraws,
  HARD_MONEY_DEFAULTS,
  type Draw,
  type HardMoneyLoan,
  type HardMoneyTerms,
  type InterestSchedule,
} from "../mortgage/hardMoney";
import { splitRehabFunding, type ResolvedRehab } from "../rehab/resolveRehab";
import { dpaRepaymentAtSale } from "../mortgage/dpa";
import {
  calculateCapitalGains,
  DEFAULT_TAX_DEFAULTS,
  type TaxDefaults,
} from "../mortgage/capitalGains";

/**
 * Assemble the deal from a house, so every surface reads one calculation.
 *
 * The properties list, the profit card, the deal verdict and the compare view
 * all call this. That is the whole point: a house that shows $85,500 walk-away
 * on its own page must not show something else in the list, and the only way
 * to guarantee that is for there to be one place the number comes from.
 *
 * What the caller supplies is the house. What it may override is the handful
 * of figures a person actually argues about — how long they will hold it, what
 * the accountant says about gains, which fees the title company is charging.
 */

/** Hold months by loan type, when the user has not said otherwise. */
export const DEFAULT_HOLD_MONTHS = { financed: 12, hardMoney: 6 } as const;

export function defaultHoldMonths(inputs: MortgageInputs): number {
  return inputs.loanType === "hardMoney"
    ? DEFAULT_HOLD_MONTHS.hardMoney
    : DEFAULT_HOLD_MONTHS.financed;
}

export interface DealHouse {
  /** Resolved inputs — profile, defaults and the house, already merged. */
  inputs: MortgageInputs;
  result: MortgageResult;
  /** From `valuations`. Null when nobody has built an ARV yet. */
  arv: number | null;
  /** From the one resolver, so this never re-derives it. */
  rehab: ResolvedRehab;
  /** Seller closing, as a percent of the resale price. From defaults. */
  sellerClosingPct: number;
  /** Rates for the capital-gains estimate. Falls back to the module defaults. */
  taxes?: TaxDefaults;
  /** Two-letter state, for the state rate. */
  state?: string | null;
}

/** Everything a person can type over. Absent means "use the derived figure". */
export interface DealOverrides {
  holdMonths?: number;
  loanPayoff?: number;
  sellerClosingCosts?: number;
  dpaRepayment?: number;
  capitalGains?: number;
  /** Lived in it two of the last five years. */
  primaryResidence?: boolean;
  otherFees?: OtherFee[];
  monthlyExtras?: number;
  /** Hard money only. */
  hardMoney?: Partial<HardMoneyTerms>;
  draws?: Draw[];
}

export interface BuiltDeal {
  params: DealParams;
  result: DealResult;
  /** Present only on a hard money deal. */
  hardMoney: { terms: HardMoneyTerms; loan: HardMoneyLoan; schedule: InterestSchedule } | null;
  holdMonths: number;
}

export function buildDeal(house: DealHouse, overrides: DealOverrides = {}): BuiltDeal {
  const { inputs, result, arv, rehab } = house;
  const isHardMoney = inputs.loanType === "hardMoney";

  const holdMonths = overrides.holdMonths ?? defaultHoldMonths(inputs);

  // ── Hard money, when that is the loan ──────────────────────────────────────
  let hardMoney: BuiltDeal["hardMoney"] = null;
  if (isHardMoney) {
    // The loan is picked once, in Run the numbers, so its terms come off the
    // inputs rather than being re-chosen here.
    const terms: HardMoneyTerms = {
      ...HARD_MONEY_DEFAULTS,
      ratePct: inputs.interestRate,
      pointsPct: inputs.points,
      purchaseLtvPct: inputs.hardMoneyPurchaseLtvPct,
      rehabFundedPct: inputs.hardMoneyRehabFundedPct,
      maxLoanToArvPct: inputs.hardMoneyMaxLoanToArvPct,
      interestStyle: inputs.hardMoneyInterestStyle,
      ...overrides.hardMoney,
    };
    const loan = sizeHardMoneyLoan(
      inputs.homeValue,
      // Sized on what the lender underwrote, which is the budget on the
      // financing analysis — not on an estimate produced afterwards.
      Math.min(rehab.total, inputs.renovationBudget),
      arv ?? 0,
      terms
    );
    const stored = inputs.hardMoneyDraws;
    const draws =
      overrides.draws ?? (stored.length > 0 ? stored : defaultDraws(loan.rehabFunded, holdMonths));
    hardMoney = { terms, loan, schedule: hardMoneyInterest(loan, terms, holdMonths, draws) };
  }

  // ── Where the rehab money comes from ──────────────────────────────────────
  const funding = splitRehabFunding(
    rehab.total,
    inputs.loanType,
    inputs.renovationProgram,
    hardMoney?.loan.rehabFunded ?? null,
    // The loan was sized on the reno budget stored with the financing
    // analysis. If the estimate came in higher, the gap is cash until the
    // numbers are re-run at the new figure.
    inputs.renovationBudget
  );

  // ── Out of the closing statement ──────────────────────────────────────────
  //
  // Hard money does not amortize: the full loan comes back at payoff. An
  // amortizing loan has been paid down over the hold, and that difference is
  // thousands on a twelve-month hold.
  const derivedPayoff = hardMoney
    ? hardMoney.loan.total
    : payoffAfterMonths(result.schedule, result.loanAmount, holdMonths);

  const derivedSellerClosing = (arv ?? 0) * (Math.max(0, house.sellerClosingPct) / 100);

  // What is still owed on the award the day you sell. A grant is nothing, a
  // deferred loan is all of it, and a forgivable one is whatever has not been
  // forgiven yet — which a single "is it a grant" flag could not express, so
  // a real loan was being written off as free money.
  const dpa = dpaRepaymentAtSale(
    {
      enabled: inputs.dpaEnabled,
      structure: inputs.dpaStructure,
      amount: result.dpaApplied,
      forgivenessYears: inputs.dpaForgivenessYears,
      forgivenessStyle: inputs.dpaForgivenessStyle,
      ratePct: inputs.dpaRate,
      termYears: inputs.dpaTermYears,
    },
    holdMonths
  );

  // ── Out of pocket ─────────────────────────────────────────────────────────
  const derivedDownPayment = hardMoney ? hardMoney.loan.downPayment : result.downPaymentAmount;
  const derivedPoints = hardMoney ? hardMoney.loan.points : (result.pointsCost ?? 0);
  // Hard money closing costs are the points, which are their own line.
  const derivedBuyerClosing = hardMoney ? 0 : result.closingCosts;

  // ── Carry ─────────────────────────────────────────────────────────────────
  const derivedCarry = hardMoney
    ? hardMoney.schedule.total
    : result.totalMonthlyWithMortgageInsurance * holdMonths;

  const oneMoreMonthCarry = hardMoney
    ? hardMoney.schedule.oneMoreMonth
    : result.totalMonthlyWithMortgageInsurance;

  // ── Tax on the sale ───────────────────────────────────────────────────────
  //
  // Derived from figures the deal already holds rather than typed, because a
  // number you have to work out yourself is a number that stays at zero — and
  // on a twelve-month flip the tax is the difference between a deal and a job.
  // Uses the effective seller closing, so an override moves the gain with it.
  const effectiveSellerClosing =
    overrides.sellerClosingCosts ?? derivedSellerClosing;

  const gains = calculateCapitalGains({
    salePrice: arv ?? 0,
    sellerClosingCosts: effectiveSellerClosing,
    purchasePrice: inputs.homeValue,
    buyerClosingCosts: derivedBuyerClosing,
    rehabTotal: rehab.total,
    holdMonths,
    state: house.state ?? null,
    primaryResidence: overrides.primaryResidence ?? false,
    taxes: house.taxes ?? DEFAULT_TAX_DEFAULTS,
  });

  const params: DealParams = {
    arv: arv === null ? null : line(arv, "valuation"),

    loanPayoff:
      overrides.loanPayoff !== undefined
        ? line(overrides.loanPayoff, hardMoney ? "hard_money_terms" : "financing_analysis", true)
        : line(
            derivedPayoff,
            hardMoney ? "hard_money_terms" : "financing_analysis",
            false,
            hardMoney
              ? "Interest only, so the whole loan is repaid at sale"
              : `Balance after ${holdMonths} months`
          ),

    sellerClosingCosts:
      overrides.sellerClosingCosts !== undefined
        ? line(overrides.sellerClosingCosts, "defaults", true)
        : line(derivedSellerClosing, "defaults", false, `${house.sellerClosingPct}% of the ARV`),

    dpaRepayment:
      overrides.dpaRepayment !== undefined
        ? line(overrides.dpaRepayment, "financing_analysis", true)
        : line(dpa.dueAtSale, "financing_analysis", false, dpa.explanation),

    capitalGains:
      overrides.capitalGains !== undefined
        ? line(overrides.capitalGains, "manual", true)
        : line(gains.tax, "computed", false, `Estimate · ${gains.explanation}`),
    otherFees: overrides.otherFees ?? [],

    downPayment: line(
      derivedDownPayment,
      hardMoney ? "hard_money_terms" : "financing_analysis"
    ),
    buyerClosingCosts: line(
      derivedBuyerClosing,
      hardMoney ? "hard_money_terms" : "financing_analysis"
    ),
    points: line(derivedPoints, hardMoney ? "hard_money_terms" : "financing_analysis"),

    rehabPaidInCash: line(
      funding.inCash,
      rehab.budgetOnly ? "rehab_budget" : "rehab_estimate",
      false,
      funding.inCash > 0 && !hardMoney && inputs.renovationProgram === "none"
        ? "No renovation financing, so the whole rehab is cash"
        : undefined
    ),

    loanShortfall: line(
      hardMoney?.loan.shortfall ?? 0,
      "computed",
      false,
      hardMoney?.loan.capped
        ? `The loan hit the ${hardMoney.terms.maxLoanToArvPct}% of ARV ceiling, so this much more is cash`
        : undefined
    ),

    holdMonths,
    carry:
      overrides.holdMonths !== undefined
        ? line(derivedCarry, hardMoney ? "hard_money_terms" : "financing_analysis", true)
        : line(
            derivedCarry,
            hardMoney ? "hard_money_terms" : "financing_analysis",
            false,
            hardMoney ? "From the interest table" : `PITI × ${holdMonths} months`
          ),
    monthlyExtras: line(
      overrides.monthlyExtras ?? 0,
      "manual",
      overrides.monthlyExtras !== undefined
    ),
    oneMoreMonthCarry,

    purchasePrice: inputs.homeValue,
    rehabTotal: rehab.total,
  };

  return { params, result: calculateDeal(params), hardMoney, holdMonths };
}
