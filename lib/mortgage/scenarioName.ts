import { type MortgageInputs } from "./types";
import { LOAN_PRODUCTS } from "./loanTypes";

/**
 * A name that describes the scenario, not the house.
 *
 * Saves were named after the address — "1900 Windsor Dr SW, Atlanta, GA" — which
 * reads fine in a list of houses and uselessly in a list of scenarios on one
 * house, where every row says the same thing. The useful name is what makes
 * this scenario different from the one above it: the loan and the assistance.
 *
 * Suggested, never imposed. The user can type over it, and existing rows are
 * left alone until someone chooses to rename them — a name somebody picked is
 * not ours to overwrite.
 */

const SHORT_PRODUCT: Record<string, string> = {
  fha203k: "203(k)",
  homestyle: "HomeStyle",
  fha: "FHA",
  conventional: "Conventional",
  va: "VA",
  hardMoney: "Hard money",
  dscr: "DSCR",
};

/** "FHA 203(k)", "Hard money" — the product, as people say it. */
export function productLabel(inputs: MortgageInputs): string {
  const match = LOAN_PRODUCTS.find(
    (p) => p.loanType === inputs.loanType && p.renovationProgram === inputs.renovationProgram
  );
  return match?.label ?? inputs.loanType;
}

/** "Deferred DPA $10,000", or null when there is no assistance. */
export function dpaLabel(inputs: MortgageInputs, award: number): string | null {
  if (!inputs.dpaEnabled || award <= 0) return null;
  const kind =
    inputs.dpaStructure === "grant"
      ? "Grant"
      : inputs.dpaStructure === "forgivable"
        ? "Forgivable"
        : inputs.dpaStructure === "amortizing"
          ? "Amortizing"
          : "Deferred";
  return `${kind} DPA $${Math.round(award).toLocaleString()}`;
}

/** The one-line description under a scenario's name. */
export function scenarioDescription(inputs: MortgageInputs, award: number): string {
  const dpa = dpaLabel(inputs, award);
  return dpa ? `${productLabel(inputs)} · ${dpa}` : productLabel(inputs);
}

/**
 * The name offered when saving: short, and about the loan.
 *
 * "203(k) with DPA" rather than "FHA 203(k) renovation · Deferred DPA $10,000"
 * — a name has to fit in a row on a phone, and the full description is already
 * on the line beneath it.
 */
export function suggestScenarioName(inputs: MortgageInputs): string {
  const match = LOAN_PRODUCTS.find(
    (p) => p.loanType === inputs.loanType && p.renovationProgram === inputs.renovationProgram
  );
  const short = SHORT_PRODUCT[match?.value ?? inputs.loanType] ?? productLabel(inputs);
  return inputs.dpaEnabled ? `${short} with DPA` : short;
}
