import { type MortgageInputs, type LoanType, type RenovationProgram, type DpaStructure } from "./types";
import { defaultInputs } from "./defaults";
import {
  type BuyerProfile,
  totalMonthlyDebt,
  totalMonthlyIncome,
} from "../profile/types";

/**
 * Build a complete `MortgageInputs` from the three places its fields live.
 *
 *   profile    income, debts                      — who you are
 *   defaults   program, rate, term, down %, DPA   — how you borrow
 *   house      price, taxes, insurance, reno      — this property
 *
 * The calculation functions never learn about any of this; they keep taking one
 * flat object. The point is that income stops being something you retype for
 * every house, and starts being something the app already knows.
 *
 * Phase 0 note: `renovationBudget`, `afterRepairValue` and `arv` still come from
 * the house argument. Their real homes — the primary scenario and `valuations` —
 * arrive in Phases 1 and 2.
 */

/** The part of `MortgageInputs` that belongs to a specific property. */
export type HouseInputs = Partial<
  Pick<
    MortgageInputs,
    | "homeValue"
    | "downPayment"
    | "loanAmountOverride"
    | "propertyTaxYearly"
    | "insuranceYearly"
    | "hoaMonthly"
    | "renovationBudget"
    | "afterRepairValue"
    | "arv"
    | "grossMonthlyRent"
    | "operatingExpensesMonthly"
    | "startMonth"
    | "startYear"
  >
>;

export function resolveInputs(
  profile: BuyerProfile | null,
  house: HouseInputs = {},
  now: Date = new Date()
): MortgageInputs {
  const base = defaultInputs(now);

  // No profile yet. The caller renders the "set your income" state rather than
  // showing a verdict — zero income makes calculateDti report "not applicable",
  // which is honest, where a fabricated salary would not be.
  if (!profile) {
    return { ...base, ...house, grossMonthlyIncome: 0, otherMonthlyDebt: 0 };
  }

  const d = profile.defaults;

  // The price the down payment is measured against. Matches
  // totalAcquisitionCost — price plus the financed work — so a renovation loan
  // takes its percentage of the right basis.
  const homeValue = house.homeValue ?? base.homeValue;
  const renovationBudget = house.renovationBudget ?? base.renovationBudget;
  const renovationProgram = (d.renovationProgram as RenovationProgram) ?? base.renovationProgram;

  // The contingency used here must be the one this function also returns.
  // Taking the default while returning the profile's figure would size the down
  // payment against a basis the rest of the calculator never sees — the same
  // split-basis bug the percent input had.
  const contingencyPct = d.contingencyPhotosPct;
  const financedRenovation =
    renovationProgram === "none" ? 0 : renovationBudget * (1 + contingencyPct / 100);
  const acquisitionCost = homeValue + financedRenovation;

  return {
    ...base,

    // ── defaults ──────────────────────────────────────────────────────────
    loanType: (d.loanType as LoanType) ?? base.loanType,
    renovationProgram,
    interestRate: d.interestRate,
    termYears: d.termYears,
    closingCostPercent: d.closingCostPct,
    dpaEnabled: d.dpaEnabled,
    dpaStructure: (d.dpaStructure as DpaStructure) ?? base.dpaStructure,
    dpaRate: d.dpaRate,
    dpaTermYears: d.dpaTermYears,
    // Contingency: Phase 0 always uses the photo figure. Source-based selection
    // arrives with estimates in Phase 3.
    renovationContingencyPct: contingencyPct,

    // ── house ─────────────────────────────────────────────────────────────
    ...house,

    // ── profile ───────────────────────────────────────────────────────────
    // AFTER the house spread, deliberately. Callers pass a full MortgageInputs
    // as the house argument — the calculator's own draft — and that object
    // still carries grossMonthlyIncome and otherMonthlyDebt from the defaults.
    // Spread earlier, the house's zeroes silently overwrote the real profile
    // and every ratio read $0 while the screen said the profile was loaded.
    //
    // Both are derived sums, never entered. otherMonthlyDebt counts only the
    // rows marked to include, which is how a lender exclusion is expressed.
    grossMonthlyIncome: totalMonthlyIncome(profile.incomes),
    otherMonthlyDebt: totalMonthlyDebt(profile.debts),

    // The type stores dollars; the profile stores a percent. This conversion is
    // the only place the two meet, so they cannot disagree.
    downPayment: house.downPayment ?? (acquisitionCost * d.downPaymentPct) / 100,
  };
}

/**
 * The fields a snapshot covers: profile and defaults only.
 *
 * Never the whole resolved object. `startMonth` and `startYear` resolve to
 * "today", so a snapshot of everything would make every saved scenario claim
 * its numbers had changed on the first of each month, forever.
 */
export const SNAPSHOT_KEYS = [
  "grossMonthlyIncome",
  "otherMonthlyDebt",
  "loanType",
  "renovationProgram",
  "interestRate",
  "termYears",
  "closingCostPercent",
  "dpaEnabled",
  "dpaStructure",
  "dpaRate",
  "dpaTermYears",
  "renovationContingencyPct",
] as const satisfies readonly (keyof MortgageInputs)[];

export type ProfileSnapshot = Partial<Pick<MortgageInputs, (typeof SNAPSHOT_KEYS)[number]>>;

/** What gets stored alongside a saved scenario so changes can be detected later. */
export function snapshotOf(inputs: MortgageInputs): ProfileSnapshot {
  const out: Record<string, unknown> = {};
  for (const key of SNAPSHOT_KEYS) out[key] = inputs[key];
  return out as ProfileSnapshot;
}

/**
 * Which snapshot fields differ from the current numbers.
 *
 * Drives the "your numbers changed since this ran" badge. Nothing re-runs on its
 * own — an old verdict stays traceable to the numbers behind it until the owner
 * asks for a new one.
 */
export function snapshotChanges(
  snapshot: ProfileSnapshot | null | undefined,
  current: MortgageInputs
): { field: keyof MortgageInputs; from: unknown; to: unknown }[] {
  // No snapshot means the scenario predates them. Silence is right: claiming
  // the numbers changed when we cannot know would train the badge to be ignored.
  if (!snapshot) return [];

  const out: { field: keyof MortgageInputs; from: unknown; to: unknown }[] = [];
  for (const key of SNAPSHOT_KEYS) {
    if (!(key in snapshot)) continue;
    const from = snapshot[key];
    const to = current[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ field: key, from, to });
  }
  return out;
}
