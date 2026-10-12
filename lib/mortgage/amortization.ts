import { type AmortizationRow } from "./types";

/** First payment falls one month after the start month — standard convention. */
export function paymentDate(startYear: number, startMonth: number, period: number): string {
  const d = new Date(Date.UTC(startYear, startMonth + period, 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * Level payment for a fully amortizing loan.
 * Falls back to straight principal division at a 0% rate, where the standard
 * formula divides by zero.
 */
export function monthlyPayment(principal: number, annualRatePercent: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return principal / termMonths;
  const factor = Math.pow(1 + r, termMonths);
  return (principal * r * factor) / (factor - 1);
}

export interface ScheduleOptions {
  principal: number;
  annualRatePercent: number;
  termMonths: number;
  startYear: number;
  startMonth: number;
  /** Monthly mortgage insurance charged while `mortgageInsuranceMonths` hasn't elapsed. */
  monthlyMortgageInsurance?: number;
  /**
   * How many payments carry mortgage insurance. null means for the life of the
   * loan; 0 means none.
   */
  mortgageInsuranceMonths?: number | null;
}

/** Standard amortizing schedule, one row per payment. */
export function buildAmortizationSchedule(opts: ScheduleOptions): AmortizationRow[] {
  const {
    principal,
    annualRatePercent,
    termMonths,
    startYear,
    startMonth,
    monthlyMortgageInsurance = 0,
    mortgageInsuranceMonths = 0,
  } = opts;

  const rows: AmortizationRow[] = [];
  if (principal <= 0 || termMonths <= 0) return rows;

  const r = annualRatePercent / 100 / 12;
  const payment = monthlyPayment(principal, annualRatePercent, termMonths);
  let balance = principal;

  const miLimit = mortgageInsuranceMonths === null ? termMonths : mortgageInsuranceMonths;

  for (let period = 1; period <= termMonths; period++) {
    const interest = balance * r;
    // Final payment absorbs rounding drift so the balance lands exactly at zero.
    let principalPortion = payment - interest;
    if (period === termMonths || principalPortion > balance) principalPortion = balance;

    const mi = period <= miLimit ? monthlyMortgageInsurance : 0;
    balance = balance - principalPortion;

    rows.push({
      period,
      date: paymentDate(startYear, startMonth, period),
      payment: principalPortion + interest,
      principal: principalPortion,
      interest,
      mortgageInsurance: mi,
      balance: balance < 1e-6 ? 0 : balance,
      isMortgageInsuranceEnd: mi > 0 && (period === miLimit || period === termMonths),
    });

    if (balance <= 0) break;
  }

  return rows;
}

/**
 * Hard money: interest-only payments for the term, then the full principal comes
 * due as a balloon. Nothing amortizes, so this can't share the loop above.
 */
export function buildInterestOnlySchedule(opts: {
  principal: number;
  annualRatePercent: number;
  termMonths: number;
  startYear: number;
  startMonth: number;
}): AmortizationRow[] {
  const { principal, annualRatePercent, termMonths, startYear, startMonth } = opts;
  const rows: AmortizationRow[] = [];
  if (principal <= 0 || termMonths <= 0) return rows;

  const interest = principal * (annualRatePercent / 100 / 12);

  for (let period = 1; period <= termMonths; period++) {
    const isLast = period === termMonths;
    rows.push({
      period,
      date: paymentDate(startYear, startMonth, period),
      payment: isLast ? interest + principal : interest,
      principal: isLast ? principal : 0,
      interest,
      mortgageInsurance: 0,
      balance: isLast ? 0 : principal,
      isBalloon: isLast,
    });
  }

  return rows;
}

export interface AnnualRow {
  year: number;
  payment: number;
  principal: number;
  interest: number;
  mortgageInsurance: number;
  /** Balance at the end of the year. */
  balance: number;
  months: AmortizationRow[];
  containsMortgageInsuranceEnd: boolean;
  containsBalloon: boolean;
}

/** Collapse a monthly schedule into calendar-year rows for the default view. */
export function toAnnualRows(schedule: AmortizationRow[]): AnnualRow[] {
  const byYear = new Map<number, AnnualRow>();

  for (const row of schedule) {
    const year = Number(row.date.slice(0, 4));
    let entry = byYear.get(year);
    if (!entry) {
      entry = {
        year,
        payment: 0,
        principal: 0,
        interest: 0,
        mortgageInsurance: 0,
        balance: row.balance,
        months: [],
        containsMortgageInsuranceEnd: false,
        containsBalloon: false,
      };
      byYear.set(year, entry);
    }
    entry.payment += row.payment;
    entry.principal += row.principal;
    entry.interest += row.interest;
    entry.mortgageInsurance += row.mortgageInsurance;
    entry.balance = row.balance;
    entry.months.push(row);
    if (row.isMortgageInsuranceEnd) entry.containsMortgageInsuranceEnd = true;
    if (row.isBalloon) entry.containsBalloon = true;
  }

  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}
