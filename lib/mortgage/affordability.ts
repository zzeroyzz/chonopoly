import { type MortgageInputs } from "./types";
import { LOAN_TYPE_CONFIG, FHA_ANNUAL_MIP_RATE } from "./loanTypes";
import { monthlyPayment } from "./amortization";
import { suggestedPmiRate, ltvPercent } from "./pmi";

/**
 * Maximum affordable purchase price, solved from income rather than from a
 * price the user already picked.
 *
 * The calculator's other half answers "what does this loan cost". This answers
 * "what can I buy", which is the question you have before you have a house in
 * mind.
 */

export type BindingConstraint = "front" | "back" | "none";

export interface AffordabilityResult {
  /** Whether ratios apply at all — they don't for hard money or DSCR. */
  applicable: boolean;
  /** Max purchase price, rounded. Zero when there's no income to work from. */
  maxPurchasePrice: number;
  /** The housing payment that price implies. */
  maxHousingPayment: number;
  /** Which guideline stopped us going higher. */
  binding: BindingConstraint;
  /** Cap implied by each guideline, before the price solve. */
  frontEndCap: number;
  backEndCap: number;
  /** Loan amount and down payment at the max price. */
  loanAmount: number;
  downPayment: number;
}

/** Max price is reported to this precision — the inputs don't support more. */
const ROUNDING = 500;

/**
 * Property tax as a percent of home value, derived from whatever the user has
 * already entered. Tax scales with price, which is what makes this a fixed
 * point rather than a formula.
 */
function taxRateOf(inputs: MortgageInputs): number {
  if (inputs.homeValue <= 0 || inputs.propertyTaxYearly <= 0) return 0;
  return inputs.propertyTaxYearly / inputs.homeValue;
}

/** Total monthly housing payment at a given purchase price. */
function housingPaymentAt(price: number, inputs: MortgageInputs, taxRate: number): number {
  const config = LOAN_TYPE_CONFIG[inputs.loanType];

  const downPct = inputs.homeValue > 0 ? (inputs.downPayment / inputs.homeValue) * 100 : 0;
  const downPayment = price * (downPct / 100);
  const loan = Math.max(0, price - downPayment);

  const principalAndInterest = monthlyPayment(loan, inputs.interestRate, inputs.termYears * 12);

  let mortgageInsurance = 0;
  if (inputs.loanType === "conventional") {
    // Conservative end of the band: being optimistic about max price sends the
    // user shopping above what they'd qualify for.
    const rate = suggestedPmiRate(ltvPercent(loan, price), true);
    mortgageInsurance = (loan * (rate / 100)) / 12;
  } else if (config.showMip) {
    mortgageInsurance = (loan * FHA_ANNUAL_MIP_RATE) / 12;
  }

  const monthlyTax = (price * taxRate) / 12;

  return (
    principalAndInterest +
    monthlyTax +
    inputs.insuranceYearly / 12 +
    inputs.hoaMonthly +
    mortgageInsurance
  );
}

export function calculateAffordability(inputs: MortgageInputs): AffordabilityResult {
  const config = LOAN_TYPE_CONFIG[inputs.loanType];

  const empty: AffordabilityResult = {
    applicable: config.showDtiRatios,
    maxPurchasePrice: 0,
    maxHousingPayment: 0,
    binding: "none",
    frontEndCap: 0,
    backEndCap: 0,
    loanAmount: 0,
    downPayment: 0,
  };

  if (!config.showDtiRatios || inputs.grossMonthlyIncome <= 0) return empty;

  const frontEndCap =
    config.frontEndGuideline !== null
      ? inputs.grossMonthlyIncome * (config.frontEndGuideline / 100)
      : Number.POSITIVE_INFINITY;

  const backEndCap =
    config.backEndGuideline !== null
      ? inputs.grossMonthlyIncome * (config.backEndGuideline / 100) - inputs.otherMonthlyDebt
      : Number.POSITIVE_INFINITY;

  const maxHousingPayment = Math.min(frontEndCap, backEndCap);
  if (!Number.isFinite(maxHousingPayment) || maxHousingPayment <= 0) return empty;

  // Which guideline stopped us matters more than the number: front-end binding
  // means save more or shop cheaper, back-end binding means pay off the car.
  const binding: BindingConstraint =
    frontEndCap === backEndCap ? "front" : frontEndCap < backEndCap ? "front" : "back";

  const taxRate = taxRateOf(inputs);

  // Binary search rather than a closed form. Tax scales with price, and the PMI
  // band can change as price moves — two discontinuities a formula can't hold.
  let low = 0;
  const high0 = Math.max(inputs.homeValue * 4, 2_000_000);
  let high = high0;

  for (let i = 0; i < 60 && high - low > 1; i++) {
    const mid = (low + high) / 2;
    if (housingPaymentAt(mid, inputs, taxRate) <= maxHousingPayment) low = mid;
    else high = mid;
  }

  const maxPurchasePrice = Math.floor(low / ROUNDING) * ROUNDING;

  const downPct = inputs.homeValue > 0 ? (inputs.downPayment / inputs.homeValue) * 100 : 0;
  const downPayment = maxPurchasePrice * (downPct / 100);

  return {
    applicable: true,
    maxPurchasePrice,
    maxHousingPayment,
    binding,
    frontEndCap: Number.isFinite(frontEndCap) ? frontEndCap : 0,
    backEndCap: Number.isFinite(backEndCap) ? backEndCap : 0,
    loanAmount: Math.max(0, maxPurchasePrice - downPayment),
    downPayment,
  };
}
