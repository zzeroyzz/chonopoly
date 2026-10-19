/**
 * What the sale costs you in tax, estimated.
 *
 * Capital gains was a number you typed, which meant it was usually zero and
 * the walk-away figure was usually wrong by five figures. It is derivable from
 * things the deal already knows — what you paid, what you put in, what you sold
 * it for, and how long you held it — so it is derived, shown with its working,
 * and left overridable.
 *
 * Labelled an estimate everywhere, deliberately. Rates vary with total income,
 * net investment income tax, depreciation recapture and dealer-status rules
 * that no app should pretend to resolve. This gets the decision roughly right;
 * an accountant gets it exactly right.
 */

export type FilingStatus = "single" | "married_joint" | "married_separate" | "head_of_household";

export const FILING_STATUS_LABEL: Record<FilingStatus, string> = {
  single: "Single",
  married_joint: "Married filing jointly",
  married_separate: "Married filing separately",
  head_of_household: "Head of household",
};

/**
 * The primary-residence exclusion, when you have lived in it two of the last
 * five years. Joint filers get double.
 */
export const PRIMARY_RESIDENCE_EXCLUSION: Record<FilingStatus, number> = {
  single: 250_000,
  married_joint: 500_000,
  married_separate: 250_000,
  head_of_household: 250_000,
};

/** A hold of twelve months or less is taxed as ordinary income, not long-term. */
export const LONG_TERM_MONTHS = 12;

export interface TaxDefaults {
  filingStatus: FilingStatus;
  /** Your bracket, for a flip held a year or less. */
  federalOrdinaryPct: number;
  federalLongTermPct: number;
  /** Keyed by two-letter state. Georgia is prefilled; all of it is editable. */
  stateRatesPct: Record<string, number>;
}

export const DEFAULT_TAX_DEFAULTS: TaxDefaults = {
  filingStatus: "single",
  federalOrdinaryPct: 24,
  federalLongTermPct: 15,
  stateRatesPct: { GA: 5.39 },
};

/**
 * Pull the rates off a buyer profile, falling back field by field.
 *
 * The columns arrive with a migration that has not been run, so a profile
 * saved before it simply has none of these and the module defaults stand in.
 */
export function taxDefaultsFrom(
  defaults:
    | {
        filingStatus?: string;
        federalOrdinaryPct?: number;
        federalLongTermPct?: number;
        stateTaxRatesPct?: Record<string, number>;
      }
    | null
    | undefined
): TaxDefaults {
  if (!defaults) return DEFAULT_TAX_DEFAULTS;
  const status = defaults.filingStatus;
  return {
    filingStatus:
      status && status in PRIMARY_RESIDENCE_EXCLUSION
        ? (status as FilingStatus)
        : DEFAULT_TAX_DEFAULTS.filingStatus,
    federalOrdinaryPct: defaults.federalOrdinaryPct ?? DEFAULT_TAX_DEFAULTS.federalOrdinaryPct,
    federalLongTermPct: defaults.federalLongTermPct ?? DEFAULT_TAX_DEFAULTS.federalLongTermPct,
    stateRatesPct: defaults.stateTaxRatesPct ?? DEFAULT_TAX_DEFAULTS.stateRatesPct,
  };
}

export interface CapitalGainsInput {
  /** The resale price. */
  salePrice: number;
  sellerClosingCosts: number;
  purchasePrice: number;
  buyerClosingCosts: number;
  rehabTotal: number;
  holdMonths: number;
  /** Two-letter state, for the state rate. */
  state: string | null;
  /** Lived in it two of the last five years. */
  primaryResidence: boolean;
  taxes: TaxDefaults;
}

export interface CapitalGainsResult {
  /** Sale price − seller closing − (purchase + buyer closing + rehab). */
  gain: number;
  exclusionApplied: number;
  taxableGain: number;
  isLongTerm: boolean;
  federalPct: number;
  statePct: number;
  /** The combined rate actually applied. */
  totalPct: number;
  tax: number;
  /** The working, for the line: "gain × (fed + state)". */
  explanation: string;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function calculateCapitalGains(input: CapitalGainsInput): CapitalGainsResult {
  const basis =
    Math.max(0, input.purchasePrice) +
    Math.max(0, input.buyerClosingCosts) +
    Math.max(0, input.rehabTotal);

  const netProceeds = Math.max(0, input.salePrice) - Math.max(0, input.sellerClosingCosts);
  const gain = netProceeds - basis;

  const isLongTerm = input.holdMonths > LONG_TERM_MONTHS;
  const federalPct = isLongTerm
    ? input.taxes.federalLongTermPct
    : input.taxes.federalOrdinaryPct;

  const statePct = input.state
    ? (input.taxes.stateRatesPct[input.state.toUpperCase()] ?? 0)
    : 0;

  // The exclusion only reaches an actual gain, and only a primary residence.
  const exclusionApplied =
    input.primaryResidence && gain > 0
      ? Math.min(gain, PRIMARY_RESIDENCE_EXCLUSION[input.taxes.filingStatus])
      : 0;

  // A loss is not taxed here. Carrying it against other income is a return
  // question, not a deal question.
  const taxableGain = Math.max(0, gain - exclusionApplied);
  const totalPct = Math.max(0, federalPct) + Math.max(0, statePct);
  const tax = taxableGain * (totalPct / 100);

  const rateNote = `${federalPct}% federal${statePct > 0 ? ` + ${statePct}% state` : ""}`;

  let explanation: string;
  if (gain <= 0) {
    explanation = `No gain to tax (${money(gain)})`;
  } else if (exclusionApplied >= gain) {
    explanation = `${money(gain)} gain, excluded as a primary residence`;
  } else if (exclusionApplied > 0) {
    explanation = `${money(gain)} gain − ${money(exclusionApplied)} excluded = ${money(
      taxableGain
    )} × ${rateNote}`;
  } else {
    explanation = `${money(gain)} gain × ${rateNote} · ${
      isLongTerm ? "held over a year" : "held a year or less"
    }`;
  }

  return {
    gain,
    exclusionApplied,
    taxableGain,
    isLongTerm,
    federalPct,
    statePct,
    totalPct,
    tax,
    explanation,
  };
}
