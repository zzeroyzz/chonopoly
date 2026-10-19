/**
 * Hard money: sizing the loan, scheduling the draws, and what the carry costs.
 *
 * A hard money loan is not a mortgage with a different rate. It is sized off
 * the deal rather than the borrower — a percentage of the purchase plus a
 * percentage of the rehab, held under a ceiling set by the after-repair value —
 * it pays interest only, and the principal comes back out of the sale. There is
 * no DTI because there is no income test: the question is whether you have the
 * cash to get in and carry it, not whether a ratio clears.
 *
 * Rehab arrives in draws rather than at closing, which is the part that decides
 * what the carry actually costs. Charging interest on money the lender has not
 * advanced yet is the difference between Dutch and Non-Dutch, and over six
 * months it is thousands.
 */

/** Interest on the full loan from day one, or only on what has been drawn. */
export type InterestStyle = "dutch" | "non_dutch";

/** One rehab advance: the month it lands, and how much. */
export interface Draw {
  /** 1-based month of the hold. A draw in month 3 accrues from month 3. */
  month: number;
  amount: number;
}

export interface HardMoneyTerms {
  /** Annual rate, as a percent. */
  ratePct: number;
  /** Origination points, as a percent of the funded loan. */
  pointsPct: number;
  /** Advance against the purchase price, as a percent. */
  purchaseLtvPct: number;
  /** How much of the rehab the lender funds, as a percent. */
  rehabFundedPct: number;
  /** Ceiling on the whole loan, as a percent of ARV. */
  maxLoanToArvPct: number;
  interestStyle: InterestStyle;
}

export const HARD_MONEY_DEFAULTS: HardMoneyTerms = {
  ratePct: 15,
  pointsPct: 2,
  purchaseLtvPct: 85,
  rehabFundedPct: 100,
  maxLoanToArvPct: 75,
  interestStyle: "non_dutch",
};

export interface HardMoneyLoan {
  /** Advanced at closing against the purchase. */
  purchaseAdvance: number;
  /** The part of the rehab the lender funds, after the ARV ceiling. */
  rehabFunded: number;
  /** purchaseAdvance + rehabFunded. What gets repaid at sale. */
  total: number;

  /** What the terms would have funded with no ceiling. */
  uncapped: number;
  /** ARV × maxLoanToArv. */
  arvCeiling: number;
  /** True when the ceiling reduced the loan. */
  capped: boolean;
  /**
   * What the ceiling took away. It does not vanish — it becomes cash the buyer
   * has to bring, which is the whole reason this is surfaced rather than
   * silently reducing the loan.
   */
  shortfall: number;

  /** Rehab the lender is not funding, from the funded percentage. */
  rehabUnfunded: number;
  /** Down payment against the purchase: price minus the purchase advance. */
  downPayment: number;
  /** Points, charged on the funded loan. */
  points: number;
}

/**
 * Size the loan.
 *
 * The ceiling bites the rehab draws rather than the purchase advance, because
 * the purchase advance is wired at closing and the draws are what a lender
 * actually trims when the ARV will not support the full request.
 */
export function sizeHardMoneyLoan(
  purchasePrice: number,
  rehabTotal: number,
  arv: number,
  terms: HardMoneyTerms
): HardMoneyLoan {
  const purchase = Math.max(0, purchasePrice);
  const rehab = Math.max(0, rehabTotal);

  const wantedPurchaseAdvance = purchase * (Math.max(0, terms.purchaseLtvPct) / 100);
  const wantedRehabFunded = rehab * (Math.max(0, terms.rehabFundedPct) / 100);
  const uncapped = wantedPurchaseAdvance + wantedRehabFunded;

  const arvCeiling = Math.max(0, arv) * (Math.max(0, terms.maxLoanToArvPct) / 100);

  const purchaseAdvance = Math.min(wantedPurchaseAdvance, arvCeiling);
  const rehabFunded = Math.max(0, Math.min(wantedRehabFunded, arvCeiling - purchaseAdvance));
  const total = purchaseAdvance + rehabFunded;

  return {
    purchaseAdvance,
    rehabFunded,
    total,
    uncapped,
    arvCeiling,
    capped: uncapped - total > 0.005,
    shortfall: Math.max(0, uncapped - total),
    rehabUnfunded: Math.max(0, rehab - wantedRehabFunded),
    downPayment: Math.max(0, purchase - purchaseAdvance),
    points: total * (Math.max(0, terms.pointsPct) / 100),
  };
}

/**
 * Spread the funded rehab evenly across the hold, as a starting point.
 *
 * Evenly over the rehab months rather than all at closing, because that is how
 * draws actually work — the lender reimburses finished work. The user edits
 * these; this only decides what they start from.
 */
export function defaultDraws(rehabFunded: number, holdMonths: number): Draw[] {
  const months = Math.max(0, Math.floor(holdMonths));
  if (months === 0 || rehabFunded <= 0) return [];

  // Rehab is assumed to run over the first half of the hold, with a minimum of
  // one month: work finishes before the house is listed, not at payoff.
  const drawMonths = Math.max(1, Math.round(months / 2));
  const each = rehabFunded / drawMonths;

  return Array.from({ length: drawMonths }, (_, i) => ({
    month: i + 1,
    amount: each,
  }));
}

export interface InterestRow {
  month: number;
  /** Advanced this month. */
  drawn: number;
  /** Balance interest is charged on for this month. */
  balance: number;
  interest: number;
  /** Running total through this month. */
  cumulative: number;
}

export interface InterestSchedule {
  rows: InterestRow[];
  total: number;
  /** What one more month at the final balance would add. */
  oneMoreMonth: number;
}

/**
 * The monthly interest table.
 *
 * Dutch charges the full loan from month one whether or not the money has been
 * advanced; Non-Dutch charges only what is outstanding. A draw in month N is
 * outstanding for month N — that is the convention the worked examples use, and
 * it is the conservative one.
 */
export function hardMoneyInterest(
  loan: HardMoneyLoan,
  terms: HardMoneyTerms,
  holdMonths: number,
  draws: Draw[]
): InterestSchedule {
  const months = Math.max(0, Math.floor(holdMonths));
  const monthlyRate = Math.max(0, terms.ratePct) / 100 / 12;

  const byMonth = new Map<number, number>();
  for (const draw of draws) {
    byMonth.set(draw.month, (byMonth.get(draw.month) ?? 0) + Math.max(0, draw.amount));
  }

  const rows: InterestRow[] = [];
  let balance = loan.purchaseAdvance;
  let cumulative = 0;

  for (let month = 1; month <= months; month += 1) {
    const drawn = byMonth.get(month) ?? 0;
    balance += drawn;

    // Dutch ignores the balance entirely and charges the committed loan.
    const charged = terms.interestStyle === "dutch" ? loan.total : balance;
    const interest = charged * monthlyRate;
    cumulative += interest;

    rows.push({ month, drawn, balance: charged, interest, cumulative });
  }

  const finalBalance = terms.interestStyle === "dutch" ? loan.total : balance;

  return {
    rows,
    total: cumulative,
    oneMoreMonth: finalBalance * monthlyRate,
  };
}
