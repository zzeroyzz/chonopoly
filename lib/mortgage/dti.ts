import { type DtiResult, type MortgageInputs, type MortgageResult, type RatioStatus } from "./types";
import { LOAN_TYPE_CONFIG } from "./loanTypes";

function status(ratio: number, guideline: number | null): RatioStatus {
  if (guideline === null) return "pass";
  if (ratio <= guideline) return "pass";
  // A few points over the guideline is common and still approvable; well over isn't.
  if (ratio <= guideline + 7) return "caution";
  return "fail";
}

/**
 * Front-end = PITI / gross monthly income.
 * Back-end = (PITI + all other monthly debt) / gross monthly income.
 *
 * PITI here is the spec's definition: principal + interest + tax + insurance +
 * HOA + mortgage insurance — i.e. the full housing payment.
 */
export function calculateDti(inputs: MortgageInputs, result: MortgageResult): DtiResult {
  const config = LOAN_TYPE_CONFIG[inputs.loanType];

  if (!config.showDtiRatios || inputs.grossMonthlyIncome <= 0) {
    return {
      applicable: config.showDtiRatios,
      frontEnd: 0,
      backEnd: 0,
      frontGuideline: config.frontEndGuideline,
      backGuideline: config.backEndGuideline,
      frontStatus: "pass",
      backStatus: "pass",
      note: config.guidelineNote,
    };
  }

  const housing = result.totalMonthlyWithMortgageInsurance;
  const frontEnd = (housing / inputs.grossMonthlyIncome) * 100;
  const backEnd = ((housing + inputs.otherMonthlyDebt) / inputs.grossMonthlyIncome) * 100;

  return {
    applicable: true,
    frontEnd,
    backEnd,
    frontGuideline: config.frontEndGuideline,
    backGuideline: config.backEndGuideline,
    frontStatus: status(frontEnd, config.frontEndGuideline),
    backStatus: status(backEnd, config.backEndGuideline),
    note: config.guidelineNote,
  };
}
