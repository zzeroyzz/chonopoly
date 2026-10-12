import { type MortgageInputs } from "./types";
import { LOAN_TYPE_CONFIG, FHA_ANNUAL_MIP_RATE } from "./loanTypes";
import { monthlyPayment } from "./amortization";
import {
  effectiveInsuranceYearly,
  dpaPayment,
  renovationFinanced,
  totalAcquisitionCost,
} from "./calculate";
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

  // On a renovation loan the rehab rides along at every price — the work costs
  // what it costs regardless of what the house costs — so it's added to the
  // acquisition total before the down payment is taken. Zero when there's no
  // renovation, which leaves the ordinary case untouched.
  const financedReno = renovationFinanced(inputs);
  const acquisition = price + financedReno;

  const downBasis = totalAcquisitionCost(inputs);
  const downPct = downBasis > 0 ? (inputs.downPayment / downBasis) * 100 : 0;
  const downPayment = acquisition * (downPct / 100);
  const loan = Math.max(0, acquisition - downPayment);

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
    effectiveInsuranceYearly({ ...inputs, homeValue: price }) / 12 +
    inputs.hoaMonthly +
    mortgageInsurance +
    // An amortizing assistance second is a real payment the borrower carries, so
    // it has to be inside the solve. It doesn't scale with price — the award is
    // a fixed dollar amount — so it shifts the whole curve down rather than
    // changing its shape. Grants and deferred seconds contribute nothing here,
    // which is exactly the point of asking which structure it is.
    dpaPayment(inputs)
  );
}

export interface RequiredIncome {
  applicable: boolean;
  /** Gross monthly income the front-end guideline demands for this payment. */
  frontEndMonthly: number;
  /** Same for the back-end guideline, which also carries the other monthly debt. */
  backEndMonthly: number;
  /** The one that actually governs — you need to clear both. */
  requiredMonthly: number;
  requiredAnnual: number;
  binding: BindingConstraint;
  /** How the user's stated income compares. Null when they haven't entered one. */
  surplusMonthly: number | null;
  qualifies: boolean | null;
}

/**
 * The other direction: given this house and this payment, what income does it
 * take to qualify?
 *
 * The ratios are defined against income, so inverting them is the natural way to
 * read them — "you need $8,300 a month" is a number you can check against a
 * payslip, where "25.7% / 28%" is not.
 */
export function calculateRequiredIncome(
  inputs: MortgageInputs,
  housingPayment: number
): RequiredIncome {
  const config = LOAN_TYPE_CONFIG[inputs.loanType];

  if (!config.showDtiRatios || housingPayment <= 0) {
    return {
      applicable: config.showDtiRatios,
      frontEndMonthly: 0,
      backEndMonthly: 0,
      requiredMonthly: 0,
      requiredAnnual: 0,
      binding: "none",
      surplusMonthly: null,
      qualifies: null,
    };
  }

  const frontEndMonthly =
    config.frontEndGuideline !== null ? housingPayment / (config.frontEndGuideline / 100) : 0;

  const backEndMonthly =
    config.backEndGuideline !== null
      ? (housingPayment + inputs.otherMonthlyDebt) / (config.backEndGuideline / 100)
      : 0;

  const requiredMonthly = Math.max(frontEndMonthly, backEndMonthly);
  const binding: BindingConstraint = frontEndMonthly >= backEndMonthly ? "front" : "back";

  const hasIncome = inputs.grossMonthlyIncome > 0;

  return {
    applicable: true,
    frontEndMonthly,
    backEndMonthly,
    requiredMonthly,
    requiredAnnual: requiredMonthly * 12,
    binding,
    surplusMonthly: hasIncome ? inputs.grossMonthlyIncome - requiredMonthly : null,
    qualifies: hasIncome ? inputs.grossMonthlyIncome >= requiredMonthly : null,
  };
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
