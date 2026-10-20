import { type BuyerProfile } from "../profile/types";
import { resolveInputs, type HouseInputs } from "../mortgage/resolveInputs";
import { calculateMortgage } from "../mortgage/calculate";
import { calculateDti } from "../mortgage/dti";
import { calculate203kCap } from "../mortgage/renovationCap";
import { buildDeal } from "../deal/buildDeal";
import { resolveRehab, type RehabEstimateInput } from "../rehab/resolveRehab";
import {
  assessAffordability,
  assessDeal,
  type AffordabilityAssessment,
  type DealAssessment,
} from "../mortgage/verdicts";
import { calculateArv, subjectOptions } from "../comps/arv";
import { type Comp } from "../comps/types";
import { explainVerdicts, type VerdictExplanations } from "../deal/explainDeal";
import { offerCeiling } from "../offers/offerCeiling";
import { VERDICT_THRESHOLDS } from "../mortgage/defaults";

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
  /** For the comp-fit check: a four-bed is not a comp for a two-bed. */
  beds?: number | null;
  /** What the house is on the market for, as entered on Add or Edit. */
  listPrice?: number | null;
  annualTaxes: number | null;
  listingUrl: string | null;
  photoUrl?: string | null;
  needsAddressReview: boolean;
  visitCompletedAt: string | null;
  /**
   * One of the handful being decided between.
   *
   * Optional because the column arrives with a migration that may not have
   * run — absent reads as false rather than as an error.
   */
  isFinalist?: boolean;
  /** The primary financing analysis's stored inputs, when there is one. */
  analysisInputs: HouseInputs | null;
  analysisLabel: string | null;
  /** A rehab analysis exists for this house. */
  hasRehabEstimate: boolean;
  /**
   * The estimate itself, once Phase 3 produces one. Null until then, which is
   * what makes the resolver fall back to the reno budget and label it
   * "Budget only".
   */
  rehabEstimate?: RehabEstimateInput | null;
  comps: Comp[];
  /** True until the comps have been reviewed on the Comps tab. */
  baths: number | null;
  propertyType: string | null;
  yearBuilt: number | null;
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
  /** What lands in your account at closing. The headline figure. */
  walkAwayCash: number | null;
  /** What the deal made, after cash in and the carry. What the verdict judges. */
  trueProfit: number | null;
  marginPct: number | null;

  affordability: AffordabilityAssessment;
  deal: DealAssessment;
  checklist: ScreenChecklist;

  /** True when the ARV came from unreviewed comps. */
  /** How many comps the owner approved, and how many are still waiting. */
  approvedComps: number;
  compsToReview: number;
  isFinalist: boolean;
  /** The house's picture, for the card thumbnail. */
  photoUrl: string | null;
  /** Everything the compare view needs, from the same build as the card. */
  loanType: string;
  /** True profit over cash in. Null when no cash went in. */
  roiPct: number | null;
  /** Down payment, closing, points and any rehab paid in cash. */
  cashIn: number;
  holdMonths: number;
  /** Carry plus the monthly extras for one more month. */
  oneMoreMonth: number;
  /** Which kind of estimate the rehab number came from, when there is one. */
  rehabSource: "photos" | "visit" | null;
  /** The reno budget the loan was sized on, for the budget check. */
  rehabBudget: number;
  /**
   * The asking price the house itself carries, if anyone has entered one.
   *
   * Separate from `price`, which falls back to the calculator's default when
   * no analysis exists — that default is what made every new house read
   * $350,000 as though it were a fact about the house.
   */
  listPrice: number | null;
  /** The rehab figure actually in use — the estimate, or the budget. */
  rehabTotal: number;
  listingUrl: string | null;
  /**
   * What each verdict tag says when it is tapped.
   *
   * Built here rather than on the card because the explanations need the
   * whole deal, the lender's limits and the offer-ceiling search, none of
   * which survive into a row. Building them once also means the list and the
   * house's own header cannot word the same verdict differently.
   */
  explanations: VerdictExplanations;
}

export interface ScreenContext {
  profile: BuyerProfile | null;
  now?: Date;
}

export function buildScreenRow(house: ScreenHouse, context: ScreenContext): ScreenRow {
  const { profile, now } = context;

  // The house's own figures layered over the profile and defaults — the same
  // path the calculator takes, so the table and the calculator cannot
  // disagree about a house.
  const houseInputs: HouseInputs = {
    // The house's own asking price seeds the figures, so a house nobody has
    // run the numbers on still reads its real price rather than the
    // calculator's $350,000 default. An analysis set on top of it wins,
    // because that is a price someone chose deliberately.
    ...(house.listPrice !== null && house.listPrice !== undefined
      ? { homeValue: house.listPrice }
      : {}),
    ...(house.analysisInputs ?? {}),
    ...(house.annualTaxes !== null ? { propertyTaxYearly: house.annualTaxes } : {}),
  };

  const inputs = resolveInputs(profile, houseInputs, now);
  const result = calculateMortgage(inputs);
  const dti = calculateDti(inputs, result);

  // ARV from the comps actually included.
  // The SAME call the ARV tab makes, with the same inputs. These used to
  // differ — this passed only subjectBeds while the tab passed beds, baths,
  // property type and year built — so the two screens could disagree about
  // the same house.
  const arvResult = calculateArv(
    house.comps,
    house.sqft,
    subjectOptions({
      beds: house.beds ?? null,
      baths: house.baths ?? null,
      property_type: house.propertyType,
      year_built: house.yearBuilt,
    })
  );
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

  // One resolver for the rehab number, so the list cannot disagree with the
  // Rehab tab about what this house needs.
  const rehab = resolveRehab(house.rehabEstimate ?? null, inputs.renovationBudget);

  // The same builder the profit card and the compare view use. A house that
  // reads $85,500 walk-away on its own page reads $85,500 here.
  const built = buildDeal({
    inputs,
    result,
    arv,
    rehab,
    sellerClosingPct: profile?.defaults.sellingPct ?? 8,
  });
  const deal = built.result;

  // Provisional until someone has reviewed the comps. Every comp RentCast
  // returned is included by default, which is a real ARV but an unreviewed
  // one, and any verdict resting on it has to say so.
  // Was: arv !== null && !house.compsReviewed, where compsReviewed GUESSED at
  // review state from "is anything unticked or hand-entered". Every house
  // whose comps were all ticked read as unreviewed forever, so a card showed
  // an ARV and "ARV not checked" side by side. There is a real review state
  // now, so there is nothing left to guess.
  const approvedComps = arvResult.usedComps.length;
  const compsToReview = arvResult.stillToReview;

  const dealVerdict = assessDeal({ deal, provisionalArv: false });

  // What the tags say when tapped. The ceiling search only runs when the deal
  // falls short, since that is the only time "offer this instead" is an
  // answer — it costs a few dozen deal builds, so it is not run otherwise.
  const needsOffer = dealVerdict.verdict !== "works" && arv !== null;
  const ceilingFor = (floor: number) =>
    needsOffer
      ? offerCeiling({
          house: { arv, rehab, sellerClosingPct: profile?.defaults.sellingPct ?? 8 },
          inputs,
          profitFloor: floor,
        }).price
      : null;

  const explanations = explainVerdicts({
    deal,
    cashAfterClosing:
      (profile?.cashAvailable ?? 0) - (result.cashToClose + (renovationCap?.outOfPocketGap ?? 0)),
    monthlyPayment: result.totalMonthlyWithMortgageInsurance,
    combinedLtv: result.combinedLtv,
    affordReasons: affordability.reasons,
    affordVerdict: affordability.verdict,
    dealVerdict: dealVerdict.verdict,
    needsProfile: affordability.needsProfile,
    arvUnreviewed: false,
    priceForWorks: ceilingFor(VERDICT_THRESHOLDS.dealMinProfitWorks),
    priceForThin: ceilingFor(VERDICT_THRESHOLDS.dealMinProfitThin),
  });

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
    listPrice: house.listPrice ?? null,
    piti: result.totalMonthlyWithMortgageInsurance,
    backDti: dti.applicable ? dti.backEnd : null,
    cashToClose: result.cashToClose + (renovationCap?.outOfPocketGap ?? 0),
    arv,
    maxOffer: deal.maxOffer ?? 0,
    walkAwayCash: deal.walkAwayCash,
    trueProfit: deal.trueProfit,
    marginPct: deal.marginPct,

    affordability,
    deal: dealVerdict,
    checklist,
    approvedComps,
    compsToReview,
    isFinalist: house.isFinalist ?? false,
    photoUrl: house.photoUrl ?? null,
    loanType: inputs.loanType,
    roiPct: deal.roiPct,
    cashIn: deal.cashIn,
    holdMonths: built.holdMonths,
    oneMoreMonth: deal.oneMoreMonth,
    rehabSource: rehab.budgetOnly
      ? null
      : rehab.source === "estimate_visit"
        ? "visit"
        : "photos",
    rehabBudget: inputs.renovationBudget,
    rehabTotal: rehab.total,
    listingUrl: house.listingUrl,
    explanations,
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
    return (b.trueProfit ?? -Infinity) - (a.trueProfit ?? -Infinity);
  });
}
