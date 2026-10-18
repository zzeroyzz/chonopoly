import { type BuyerProfile } from "../profile/types";
import { resolveInputs, type HouseInputs } from "../mortgage/resolveInputs";
import { calculateMortgage } from "../mortgage/calculate";
import { calculateDti } from "../mortgage/dti";
import { calculate203kCap } from "../mortgage/renovationCap";
import {
  calculateFlip,
  financingFromAnalysis,
  genericFinancing,
  type FlipFinancing,
} from "../mortgage/flip";
import {
  assessAffordability,
  assessDeal,
  type AffordabilityAssessment,
  type DealAssessment,
} from "../mortgage/verdicts";
import { calculateArv } from "../comps/arv";
import { type Comp } from "../comps/types";

/**
 * One row of the screen table: every number needed to decide on a house,
 * computed from the same inputs the calculator uses.
 *
 * Pure. Everything is passed in, nothing is fetched, so a row can be computed
 * in a test with no database and the figures on screen can always be traced
 * back to what produced them.
 */

export interface ScreenChecklist {
  /** A primary financing analysis exists. */
  numbers: boolean;
  /** Any comps are held for this house. */
  comps: boolean;
  /** A rehab estimate exists. */
  estimate: boolean;
  /** A site visit has been logged. */
  visit: boolean;
  /** 0–4, for the progress dots. */
  done: number;
}

export interface ScreenHouse {
  propertyId: string;
  /** The pipeline entry, when the house is on the pipeline. Links the row. */
  entryId: string | null;
  addressLine1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  sqft: number | null;
  annualTaxes: number | null;
  listingUrl: string | null;
  needsAddressReview: boolean;
  visitCompletedAt: string | null;
  /** The primary financing analysis's stored inputs, when there is one. */
  analysisInputs: HouseInputs | null;
  analysisLabel: string | null;
  /** A rehab analysis exists for this house. */
  hasRehabEstimate: boolean;
  comps: Comp[];
  /** True until the comps have been reviewed on the Comps tab. */
  compsReviewed: boolean;
}

export interface ScreenRow {
  propertyId: string;
  entryId: string | null;
  address: string;
  needsAddressReview: boolean;

  price: number;
  piti: number;
  backDti: number | null;
  cashToClose: number;
  arv: number | null;
  /** The 70% rule, shown as a figure and never used as a gate. */
  maxOffer: number;
  profit: number | null;
  marginPct: number | null;

  affordability: AffordabilityAssessment;
  deal: DealAssessment;
  checklist: ScreenChecklist;

  /** True when the ARV came from unreviewed comps. */
  provisionalArv: boolean;
  listingUrl: string | null;
}

export interface ScreenContext {
  profile: BuyerProfile | null;
  now?: Date;
}

/**
 * Financing for the flip, from the house's real analysis when it has one.
 *
 * The generic fallback is for a house nobody has run numbers on yet — it still
 * belongs on the screen, because deciding not to run numbers is also a
 * decision the table should inform.
 */
function financingFor(
  house: ScreenHouse,
  inputs: ReturnType<typeof resolveInputs>,
  result: ReturnType<typeof calculateMortgage>,
  holdingMonths: number
): FlipFinancing {
  if (house.analysisInputs) {
    return financingFromAnalysis(inputs, result, holdingMonths, house.analysisLabel);
  }
  return genericFinancing(result.loanAmount, inputs.interestRate, inputs.points, holdingMonths);
}

export function buildScreenRow(house: ScreenHouse, context: ScreenContext): ScreenRow {
  const { profile, now } = context;

  // The house's own figures layered over the profile and defaults — the same
  // path the calculator takes, so the table and the calculator cannot
  // disagree about a house.
  const houseInputs: HouseInputs = {
    ...(house.analysisInputs ?? {}),
    ...(house.annualTaxes !== null ? { propertyTaxYearly: house.annualTaxes } : {}),
  };

  const inputs = resolveInputs(profile, houseInputs, now);
  const result = calculateMortgage(inputs);
  const dti = calculateDti(inputs, result);

  // ARV from the comps actually included.
  const arvResult = calculateArv(house.comps, house.sqft);
  const arv = arvResult.value;

  const renovationCap =
    inputs.renovationProgram === "none"
      ? null
      : calculate203kCap(inputs, {
          countyLoanLimit: profile?.defaults.countyLoanLimit ?? null,
          // ARV drives the 110% ceiling, so the comps feed the cap too.
          asIsValue: null,
        });

  const affordability = assessAffordability({
    inputs: arv !== null ? { ...inputs, afterRepairValue: arv } : inputs,
    result,
    dti,
    renovationCap,
    cashAvailable: profile?.cashAvailable ?? 0,
    countyLoanLimit: profile?.defaults.countyLoanLimit ?? null,
  });

  const holdingMonths = profile?.defaults.holdingMonths ?? 5;
  const rehabTotal = inputs.renovationBudget;

  const flip = calculateFlip({
    arv: arv ?? 0,
    purchasePrice: inputs.homeValue,
    rehabTotal,
    buyingPct: profile?.defaults.buyingPct ?? 1,
    sellingPct: profile?.defaults.sellingPct ?? 8,
    holdingMonthly: profile?.defaults.holdingMonthly ?? 0,
    holdingMonths,
    financing: financingFor(house, inputs, result, holdingMonths),
  });

  // Provisional until someone has reviewed the comps. Every comp RentCast
  // returned is included by default, which is a real ARV but an unreviewed
  // one, and any verdict resting on it has to say so.
  const provisionalArv = arv !== null && !house.compsReviewed;

  const deal = assessDeal({ flip, provisionalArv });

  const checklist: ScreenChecklist = {
    numbers: house.analysisInputs !== null,
    comps: house.comps.length > 0,
    estimate: house.hasRehabEstimate,
    visit: house.visitCompletedAt !== null,
    done: 0,
  };
  checklist.done = [checklist.numbers, checklist.comps, checklist.estimate, checklist.visit].filter(
    Boolean
  ).length;

  return {
    propertyId: house.propertyId,
    entryId: house.entryId,
    address: [house.addressLine1, house.city, house.state, house.zip]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(", "),
    needsAddressReview: house.needsAddressReview,

    price: inputs.homeValue,
    piti: result.totalMonthlyWithMortgageInsurance,
    backDti: dti.applicable ? dti.backEnd : null,
    cashToClose: result.cashToClose + (renovationCap?.outOfPocketGap ?? 0),
    arv,
    maxOffer: flip.maxOffer,
    profit: arv === null ? null : flip.profit,
    marginPct: arv === null ? null : flip.marginPct,

    affordability,
    deal,
    checklist,
    provisionalArv,
    listingUrl: house.listingUrl,
  };
}

/**
 * Sort so the rows that need a decision come first.
 *
 * Qualifying-and-working houses lead, then anything tight or thin, then the
 * ones already ruled out — a screen of fifteen houses should put the two worth
 * acting on at the top rather than making the user scan for them.
 */
const AFFORDABILITY_RANK = { qualifies: 0, tight: 1, does_not_qualify: 2 } as const;
const DEAL_RANK = { works: 0, thin: 1, does_not_work: 2 } as const;

export function sortScreenRows(rows: ScreenRow[]): ScreenRow[] {
  return [...rows].sort((a, b) => {
    const byDeal = DEAL_RANK[a.deal.verdict] - DEAL_RANK[b.deal.verdict];
    if (byDeal !== 0) return byDeal;

    const byAffordability =
      AFFORDABILITY_RANK[a.affordability.verdict] - AFFORDABILITY_RANK[b.affordability.verdict];
    if (byAffordability !== 0) return byAffordability;

    // Then the bigger payday, with no-ARV rows last.
    return (b.profit ?? -Infinity) - (a.profit ?? -Infinity);
  });
}
