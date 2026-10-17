/**
 * The buyer profile: who you are, financially.
 *
 * Income and debts are itemised rather than totalled. A single "monthly debts"
 * figure is unauditable — you cannot tell later which debts it covered — and
 * `includeInRatios` has nothing to attach to. The sums are derived in
 * `resolveInputs`, never stored and never typed.
 */

export type IncomeType = "w2" | "hourly" | "self_employed" | "other";

export interface ProfileIncome {
  id: string;
  label: string;
  incomeType: IncomeType;
  grossMonthly: number;
  /** Captured for a future joint-application view. Phase 0 does not filter on it. */
  borrower: string | null;
}

export interface ProfileDebt {
  id: string;
  label: string;
  debtType: string;
  monthlyPayment: number;
  /**
   * Lenders exclude debts — a loan with three payments left, a co-signed note
   * someone else pays. Excluded rows stay visible; they just leave the ratios.
   */
  includeInRatios: boolean;
}

/** The loan and cost defaults every screening starts from. */
export interface ProfileDefaults {
  loanType: string;
  renovationProgram: string;
  interestRate: number;
  termYears: number;
  downPaymentPct: number;
  closingCostPct: number;
  countyLoanLimit: number | null;
  dpaEnabled: boolean;
  dpaStructure: string;
  dpaRate: number;
  dpaTermYears: number;

  buyingPct: number;
  sellingPct: number;
  holdingMonthly: number;
  holdingMonths: number;
  contingencyPhotosPct: number;
  contingencyVisitPct: number;
}

export interface BuyerProfile {
  id: string;
  cashAvailable: number;
  cashReserves: number;
  defaults: ProfileDefaults;
  incomes: ProfileIncome[];
  debts: ProfileDebt[];
}

/**
 * What the calculator sees before a profile exists.
 *
 * A distinct state, not an empty profile and not a fabricated one. The ratio
 * rows render as em-dashes and offer to create the profile, rather than
 * silently screening against a $9,000 income nobody entered.
 */
export type ProfileState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "ready"; profile: BuyerProfile };

/** Total qualifying income. Every row counts. */
export function totalMonthlyIncome(incomes: ProfileIncome[]): number {
  return incomes.reduce((sum, i) => sum + Math.max(0, i.grossMonthly), 0);
}

/** Total monthly debt the ratios see — only the rows marked to include. */
export function totalMonthlyDebt(debts: ProfileDebt[]): number {
  return debts
    .filter((d) => d.includeInRatios)
    .reduce((sum, d) => sum + Math.max(0, d.monthlyPayment), 0);
}
