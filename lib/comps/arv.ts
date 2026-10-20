import { type Comp, type CompStatus, COMP_REVIEW_COUNTS } from "./types";
import { normalizeStreet } from "../property/address";
import { ORGANIZATION_BUYER } from "./fromPropertyRecords";

/**
 * After-repair value from comparable sales.
 *
 * Method: take each comp's actual selling price and adjust it only for the
 * size difference, at a deliberately low rate per square foot. The ARV is the
 * median of those adjusted prices.
 *
 * This replaced median price-per-square-foot, which broke on exactly the case
 * it was most likely to meet. Price per square foot does not scale: a 2,658
 * sqft house is not worth $165/sqft because smaller houses nearby sold at
 * $165/sqft, because the land, the kitchen and the roof do not get bigger with
 * the floor plan. On a subject larger than its comps the old method produced
 * $438,000 in a street where nothing had sold above $389,000, and nothing
 * about the number looked wrong.
 *
 * Adjusting from the price instead keeps the answer anchored to what houses
 * there actually fetched. The rate is low on purpose — an extra square foot
 * adds some value, not a whole square foot's worth of house.
 *
 * Median rather than mean: comp sets are small, and one estate sale or one
 * flipped-to-the-studs renovation drags a mean far enough to change the
 * verdict.
 *
 * Confirmed sales outrank listings. A listing is an asking price, which is an
 * opinion; a sale is evidence. Where there are at least two sold comps the ARV
 * is built from those alone and says so.
 */

/** Dollars of value per square foot of size difference. */
export const DEFAULT_SIZE_ADJUSTMENT_PER_SQFT = 40;

/** How far a comp may differ from the subject before it stops being a comp. */
export const COMP_ELIGIBILITY = {
  sqftTolerancePct: 20,
  maxDistanceMiles: 1,
  bedsTolerance: 1,
  bathsTolerance: 1,
  /**
   * Age only disqualifies a comp when a modern build is being compared to an
   * old house.
   *
   * A flat ±20 years was too blunt where it mattered most. On 1653 Sylvan Rd
   * SW — built 1930 — it threw out five of fifteen comps for being built in
   * the 1950s, four of them the cheapest in the set, and pushed the ARV up
   * $30,820. In a pre-war neighbourhood a 1951 house IS the comparable stock;
   * excluding it does not make the number more honest.
   *
   * What actually breaks a comparison is new construction standing next to an
   * old house. So both conditions must hold: one of the two was built this
   * century, AND they are at least a generation apart.
   */
  modernBuildFromYear: 2000,
  modernBuildMinGapYears: 30,
} as const;

/** At least this many sold comps and the listings stop being used at all. */
const SOLD_ONLY_THRESHOLD = 2;

/**
 * Below this, a recorded "sale" is paperwork rather than a purchase.
 *
 * County records carry deed transfers that were never a sale at market: a
 * $1,000 transfer between family members, an estate moving a title, a quitclaim
 * tidying up ownership. 1794 Melrose Dr came back at $1,000 next to houses
 * fetching $280,000.
 */
const NOMINAL_TRANSFER_FLOOR = 10_000;

/**
 * And below this share of what the other sales fetched.
 *
 * The flat floor misses a $40,000 paperwork transfer on a street where houses
 * sell for $400,000. Judged against the other sales rather than a fixed
 * number, because what counts as implausible depends on the street.
 */
const NOMINAL_TRANSFER_MEDIAN_FRACTION = 0.3;

/** Under this, a sale may be a fixer rather than a finished house. */
const FIXER_PRICE_CEILING = 200_000;

/**
 * How many approved comps make a number worth trusting.
 *
 * Lower than the old automatic thresholds (5 and 8) on purpose: every comp
 * here has been looked at by a person, so three deliberate ones say more than
 * five the app guessed at.
 */
const MIN_APPROVED_FOR_MODERATE = 3;
const MIN_APPROVED_FOR_GOOD = 6;

/** How far outside the plain range of nearby prices the ARV may sit. */
const SANITY_TOLERANCE_PCT = 10;

export interface ArvCompBreakdown {
  compId: string;
  address: string;
  status: CompStatus;
  /** What it actually fetched. */
  price: number;
  sqft: number;
  /** Subject sqft minus comp sqft — positive when the subject is bigger. */
  sqftDifference: number;
  /** The size adjustment applied, in dollars. Signed. */
  adjustment: number;
  /** price + adjustment. This is what the median is taken of. */
  adjustedPrice: number;
}

export type ArvConfidence = "none" | "low" | "moderate" | "good";

/** Why a comp is not a fair comparison, in words that go on screen. */
export interface CompEligibility {
  compId: string;
  eligible: boolean;
  /** e.g. "much smaller", "1.4 mi away", "2 more bedrooms" */
  reasons: string[];
}

export interface ArvResult {
  /** Null when nothing usable was included — never a zero posing as a value. */
  value: number | null;
  valueLow: number | null;
  valueHigh: number | null;

  subjectSqft: number | null;
  /** The rate used, so the explanation can name it. */
  adjustmentPerSqft: number;

  /** The comps that actually moved the number, with their arithmetic shown. */
  usedComps: ArvCompBreakdown[];
  /** True when sold comps alone built the number. */
  soldOnly: boolean;

  soldCount: number;
  removedCount: number;
  activeCount: number;
  skippedForMissingData: number;

  /** The plain range of what nearby homes actually fetched, unadjusted. */
  nearbyLow: number | null;
  nearbyHigh: number | null;
  /** Set when the ARV sits outside that range by more than the tolerance. */
  sanityWarning: string | null;

  /**
   * Ticked comps left out because they are not the same kind of house, with
   * the reason for each. Shown rather than silently dropped — a comp that was
   * ticked and did not count is a question the screen should answer first.
   */
  excludedForFit: CompEligibility[];

  confidence: ArvConfidence;
  warnings: string[];
  /** e.g. "3 sold · 2 removed listings" */
  basisLabel: string;
  /** "5 similar homes, adjusted for size, point to about $345,000." */
  plainSummary: string | null;

  /** One per comp, in the order given: counted, why not, and any flag. */
  compNotes: CompNote[];

  /** How many comps nobody has judged yet. */
  stillToReview: number;

  /**
   * Set instead of a value when nothing is approved. Not a warning — nothing
   * is wrong, the work simply has not been done yet.
   */
  reviewPrompt: string | null;

  /** Approved twice and counted once, by address, for the ARV card. */
  countedTwice: string[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Lower and upper quartile, by the same midpoint rule as the median. */
function quartiles(values: number[]): { low: number; high: number } {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 4) return { low: sorted[0], high: sorted[sorted.length - 1] };

  const mid = Math.floor(sorted.length / 2);
  const lowerHalf = sorted.slice(0, mid);
  const upperHalf = sorted.slice(sorted.length % 2 === 0 ? mid : mid + 1);
  return { low: median(lowerHalf), high: median(upperHalf) };
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** "Based on 4 comps you approved · 77 still to review" */
function buildApprovedLabel(approved: number, stillToReview: number): string {
  const base = `Based on ${approved} comp${approved === 1 ? "" : "s"} you approved`;
  return stillToReview > 0 ? `${base} · ${stillToReview} still to review` : base;
}

/**
 * The subject's remaining facts, for the checks added after beds and size.
 *
 * A fourth parameter rather than a reshaped signature: `compEligibility` has
 * three call sites and all of them keep working unchanged, which is the point.
 * Every field is optional because a house often knows its size before it knows
 * what it is, and a missing fact must skip its check rather than fail it.
 */
export interface SubjectFit {
  baths?: number | null;
  propertyType?: string | null;
  yearBuilt?: number | null;
}

/**
 * "Single Family", "single_family" and "SINGLE-FAMILY" are one type.
 *
 * RentCast writes comp types in title case with spaces while our own column
 * holds snake_case, so a literal comparison would mark every comp a mismatch.
 */
function normalizeType(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

/** "single_family" -> "single-family home", for a reason someone can read. */
function typeLabel(value: string): string {
  const spaced = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (normalizeType(spaced) === "singlefamily") return "single-family home";
  if (normalizeType(spaced) === "multifamily") return "multi-family building";
  return spaced;
}

/** 2 -> "2", 2.5 -> "2.5". A bathroom count is genuinely fractional. */
function countLabel(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
}

/**
 * Whether a comp is close enough to compare, and why not when it isn't.
 *
 * Exported so the comps list can show the reason beside each one rather than
 * leaving an unchecked box with no explanation.
 */
export function compEligibility(
  comp: Comp,
  subjectSqft: number | null,
  subjectBeds: number | null,
  subject: SubjectFit = {}
): CompEligibility {
  const reasons: string[] = [];

  if (subjectSqft !== null && subjectSqft > 0 && comp.sqft !== null && comp.sqft > 0) {
    const diffPct = ((comp.sqft - subjectSqft) / subjectSqft) * 100;
    if (diffPct < -COMP_ELIGIBILITY.sqftTolerancePct) reasons.push("much smaller");
    else if (diffPct > COMP_ELIGIBILITY.sqftTolerancePct) reasons.push("much bigger");
  }

  if (comp.distanceMiles !== null && comp.distanceMiles > COMP_ELIGIBILITY.maxDistanceMiles) {
    reasons.push(`${comp.distanceMiles.toFixed(1)} mi away`);
  }

  if (subjectBeds !== null && comp.beds !== null) {
    const diff = comp.beds - subjectBeds;
    if (Math.abs(diff) > COMP_ELIGIBILITY.bedsTolerance) {
      const n = Math.abs(diff);
      reasons.push(`${n} ${diff > 0 ? "more" : "fewer"} bedroom${n === 1 ? "" : "s"}`);
    }
  }

  // A townhouse is not a comp for a detached house however close it is, and
  // RentCast was never asked to exclude them.
  const subjectType = subject.propertyType;
  if (subjectType && comp.propertyType) {
    if (normalizeType(comp.propertyType) !== normalizeType(subjectType)) {
      reasons.push(`a ${typeLabel(comp.propertyType)}, not a ${typeLabel(subjectType)}`);
    }
  }

  const subjectBaths = subject.baths;
  if (subjectBaths !== null && subjectBaths !== undefined && comp.baths !== null) {
    const diff = comp.baths - subjectBaths;
    if (Math.abs(diff) > COMP_ELIGIBILITY.bathsTolerance) {
      const n = Math.abs(diff);
      reasons.push(
        `${countLabel(n)} ${diff > 0 ? "more" : "fewer"} bathroom${n === 1 ? "" : "s"}`
      );
    }
  }

  // New construction beside an old house is a different product: wiring,
  // windows, layout, the roof. Two old houses a generation apart are not —
  // in a pre-war street the 1950s stock IS the comparable stock.
  //
  // So both have to be true before age disqualifies anything: one of them was
  // built this century, and they are at least a generation apart.
  const subjectYear = subject.yearBuilt;
  if (subjectYear !== null && subjectYear !== undefined && comp.yearBuilt !== null) {
    const gap = Math.abs(comp.yearBuilt - subjectYear);
    const newest = Math.max(comp.yearBuilt, subjectYear);
    if (
      newest >= COMP_ELIGIBILITY.modernBuildFromYear &&
      gap >= COMP_ELIGIBILITY.modernBuildMinGapYears
    ) {
      const compIsNewer = comp.yearBuilt > subjectYear;
      reasons.push(
        `built ${comp.yearBuilt}, ${gap} years ${compIsNewer ? "newer" : "older"}`
      );
    }
  }

  return { compId: comp.id, eligible: reasons.length === 0, reasons };
}

/**
 * The street part of a comp's address, as a key.
 *
 * Takes the segment before the first comma, so the city never participates:
 * RentCast returned 2469 Romain Way under both "Atlanta" and "East Point".
 * The unit is dropped too, because 6721 Homer Ln came back four times — bare,
 * as "Unit 73", and under two different cities — all at the same 2,013 sqft.
 */
function streetKey(formattedAddress: string): string {
  const street = normalizeStreet(formattedAddress.split(",")[0] ?? "");
  return street.replace(/\s*\bUNIT\b.*$/, "").trim();
}

/**
 * Null when we cannot be sure, which means the comp is never deduped.
 *
 * Size is half the key on purpose. Two genuinely different houses can share a
 * street address in the data — a rebuild, a subdivided lot — and dropping a
 * real comp is worse than keeping a duplicate.
 */
function duplicateKey(comp: Comp): string | null {
  if (comp.sqft === null || comp.sqft <= 0) return null;
  const street = streetKey(comp.formattedAddress);
  return street ? `${street}|${comp.sqft}` : null;
}

/** Most recent first. Lower daysOld wins; failing that, the later date. */
function compareRecency(a: Comp, b: Comp): number {
  if (a.daysOld !== null && b.daysOld !== null) return a.daysOld - b.daysOld;
  if (a.daysOld !== null) return -1;
  if (b.daysOld !== null) return 1;

  const dateA = a.lastSeenDate ?? a.removedDate ?? a.listedDate ?? "";
  const dateB = b.lastSeenDate ?? b.removedDate ?? b.listedDate ?? "";
  if (dateA !== dateB) return dateA < dateB ? 1 : -1;
  return 0;
}

/**
 * One house, one comp.
 *
 * The same listing arrives several times under different unit numbers and
 * different cities, and every copy was counted — 2469 Romain Way sat in the
 * median twice at $225,000, weighting one house as though it were two. The
 * most recent copy is kept and the rest are reported with a reason, never
 * dropped silently.
 */
function dropDuplicateListings(comps: Comp[]): {
  unique: Comp[];
  duplicates: CompEligibility[];
} {
  const groups = new Map<string, Comp[]>();
  const unkeyed: Comp[] = [];

  for (const comp of comps) {
    const key = duplicateKey(comp);
    if (key === null) {
      unkeyed.push(comp);
      continue;
    }
    const group = groups.get(key);
    if (group) group.push(comp);
    else groups.set(key, [comp]);
  }

  const kept = new Set<string>(unkeyed.map((c) => c.id));
  const duplicates: CompEligibility[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.add(group[0].id);
      continue;
    }
    const [newest, ...rest] = [...group].sort(compareRecency);
    kept.add(newest.id);
    for (const copy of rest) {
      duplicates.push({
        compId: copy.id,
        eligible: false,
        reasons: [
          group.length === 2
            ? "same house listed twice"
            : `same house listed ${group.length} times`,
        ],
      });
    }
  }

  // Input order is meaningful — the list arrives sorted by correlation — so
  // the survivors are filtered out of the original rather than regrouped.
  return { unique: comps.filter((c) => kept.has(c.id)), duplicates };
}

/**
 * Everything the screen needs to say about one comp.
 *
 * The tick decides whether a comp counts. These notes only explain the
 * decision and set the default tick for a comp nobody has judged yet.
 */
export interface CompNote {
  compId: string;
  /** In the ARV right now. Equals the tick, once price and size are present. */
  counted: boolean;
  /** Why it fails the filter. Empty when it passes. */
  reasons: string[];
  /** Fails the filter but is ticked, so it counts anyway. */
  countedByOverride: boolean;
  /** A deed transfer rather than a purchase. Never in the nearby range. */
  nominalTransfer: boolean;
  /** Possibly a fixer rather than a finished house. Counted comps only. */
  fixerUpper: boolean;
}

/**
 * Whether a comp would start ticked, and why not.
 *
 * Judged across the whole set, not one comp at a time: a duplicate is only a
 * duplicate beside its twin, and a paperwork transfer is only obvious beside
 * what the other sales fetched. Exported so the save path, the one-time data
 * fix and the screen all reach the same verdict from the same code.
 */
export function assessComps(
  comps: Comp[],
  subjectSqft: number | null,
  options: ArvOptions = {}
): Map<string, { passes: boolean; reasons: string[]; nominalTransfer: boolean }> {
  const verdicts = new Map<
    string,
    { passes: boolean; reasons: string[]; nominalTransfer: boolean }
  >();

  // Duplicates are judged over every comp, ticked or not: the twin that makes
  // one a duplicate may itself be unticked.
  const { duplicates } = dropDuplicateListings(comps);
  const duplicateReasons = new Map(duplicates.map((d) => [d.compId, d.reasons]));

  const salePrices = comps
    .filter((c) => c.status === "sold" && c.price !== null && c.price > 0)
    .map((c) => c.price as number);

  for (const comp of comps) {
    const reasons: string[] = [];

    const nominalTransfer = isNominalTransfer(comp, salePrices);
    if (nominalTransfer) {
      reasons.push(
        `likely a paperwork transfer, not a real sale (${money(comp.price as number)})`
      );
    }

    const duplicateReason = duplicateReasons.get(comp.id);
    if (duplicateReason) reasons.push(...duplicateReason);

    reasons.push(
      ...compEligibility(comp, subjectSqft, options.subjectBeds ?? null, {
        baths: options.subjectBaths ?? null,
        propertyType: options.subjectPropertyType ?? null,
        yearBuilt: options.subjectYearBuilt ?? null,
      }).reasons
    );

    verdicts.set(comp.id, { passes: reasons.length === 0, reasons, nominalTransfer });
  }

  return verdicts;
}

/**
 * A recorded sale too small to be a purchase.
 *
 * Measured against the other sales, so this comp's own price cannot drag the
 * benchmark down with it.
 */
function isNominalTransfer(comp: Comp, allSalePrices: number[]): boolean {
  if (comp.status !== "sold" || comp.price === null || comp.price <= 0) return false;
  if (comp.price < NOMINAL_TRANSFER_FLOOR) return true;

  const others = allSalePrices.filter((p) => p !== comp.price);
  if (others.length === 0) return false;

  return comp.price < median(others) * NOMINAL_TRANSFER_MEDIAN_FRACTION;
}

/** "most are much bigger" — the reason in the fewest words that are true. */
function summariseReasons(excluded: CompEligibility[]): string {
  const counts = new Map<string, number>();
  for (const e of excluded) {
    for (const reason of e.reasons) {
      // "1.4 mi away" and "2.1 mi away" are the same complaint. So are
      // "built 2004, 39 years newer" and "built 2026, 61 years newer", and
      // every variant of the wrong kind of house.
      let key = reason;
      if (/mi away$/.test(reason)) key = "too far away";
      else if (/^same house listed/.test(reason)) key = "the same house listed more than once";
      else if (/^built /.test(reason)) key = "a different age";
      else if (/^a .+, not a /.test(reason)) key = "a different kind of house";
      else if (/bathrooms?$/.test(reason)) key = "a different number of bathrooms";
      else if (/bedrooms?$/.test(reason)) key = "a different number of bedrooms";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.length > 0 ? `most are ${ranked[0][0]}` : "they are too different";
}

function emptyResult(
  subjectSqft: number | null,
  adjustmentPerSqft: number,
  warnings: string[]
): ArvResult {
  return {
    value: null,
    valueLow: null,
    valueHigh: null,
    subjectSqft,
    adjustmentPerSqft,
    usedComps: [],
    soldOnly: false,
    soldCount: 0,
    removedCount: 0,
    activeCount: 0,
    skippedForMissingData: 0,
    nearbyLow: null,
    nearbyHigh: null,
    sanityWarning: null,
    excludedForFit: [],
    confidence: "none",
    warnings,
    basisLabel: "no comps",
    plainSummary: null,
    compNotes: [],
    stillToReview: 0,
    reviewPrompt: null,
    countedTwice: [],
  };
}

export interface ArvOptions {
  /** Dollars per square foot of difference. Defaults to the shared constant. */
  adjustmentPerSqft?: number;
  /** The subject's bed count, for the eligibility reasons. */
  subjectBeds?: number | null;
  /** The subject's bath count, property type and age. Each check is skipped
   *  when the fact is missing, so an unknown subject loses no comps. */
  subjectBaths?: number | null;
  subjectPropertyType?: string | null;
  subjectYearBuilt?: number | null;
}

/** The subject columns the ARV reads, exactly as they sit on the row. */
export interface SubjectFactsRow {
  beds: number | null;
  baths: number | null;
  property_type: string | null;
  year_built: number | null;
}

/**
 * The subject facts every ARV caller needs, assembled once.
 *
 * Four call sites each built this argument by hand and one of them left out
 * `subjectBeds`, which is how the same house came to show two different ARVs.
 * Adding a sixth fact should not be an invitation to make that mistake again.
 */
export function subjectOptions(row: SubjectFactsRow): ArvOptions {
  return {
    subjectBeds: row.beds,
    subjectBaths: row.baths,
    subjectPropertyType: row.property_type,
    subjectYearBuilt: row.year_built,
  };
}

export function calculateArv(
  comps: Comp[],
  subjectSqft: number | null,
  options: ArvOptions = {}
): ArvResult {
  const rate = Math.max(0, options.adjustmentPerSqft ?? DEFAULT_SIZE_ADJUSTMENT_PER_SQFT);

  // Hints, not decisions. These used to remove comps from the number, which
  // is why it moved four times on its own. They now only produce text.
  const verdicts = assessComps(comps, subjectSqft, options);

  const approved = comps.filter((c) => c.review === COMP_REVIEW_COUNTS);
  const stillToReview = comps.filter((c) => c.review === "needs_review").length;

  /** Nothing approved, so nothing is counted and nothing can be flagged. */
  const notesWithNothingCounted = () =>
    buildCompNotes(comps, verdicts, new Set<string>(), null);

  if (approved.length === 0) {
    const result = emptyResult(subjectSqft, rate, []);
    result.compNotes = notesWithNothingCounted();
    result.stillToReview = stillToReview;
    // Not a warning. Nothing is wrong — the work simply has not been done.
    result.reviewPrompt =
      stillToReview > 0
        ? `Review comps to get an ARV. ${stillToReview} to go.`
        : "Review comps to get an ARV.";
    return result;
  }

  // Size is still needed, but only to measure the difference — not as a
  // multiplier. A missing size now costs an adjustment, not the whole ARV.
  if (subjectSqft === null || subjectSqft <= 0) {
    const result = emptyResult(subjectSqft, rate, [
      "Add this house's square footage to get an ARV.",
    ]);
    result.compNotes = notesWithNothingCounted();
    result.stillToReview = stillToReview;
    return result;
  }

  // One house, one vote. Approving both copies of the same listing would
  // otherwise weight it twice; the card says so rather than silently
  // dropping one.
  const { unique, duplicates } = dropDuplicateListings(approved);
  const countedTwice = duplicates
    .map((d) => approved.find((c) => c.id === d.compId)?.formattedAddress)
    .filter((address): address is string => Boolean(address));

  const usable: ArvCompBreakdown[] = [];
  let skipped = 0;

  for (const comp of unique) {
    if (comp.price === null || comp.price <= 0 || comp.sqft === null || comp.sqft <= 0) {
      skipped++;
      continue;
    }
    const sqftDifference = subjectSqft - comp.sqft;
    const adjustment = sqftDifference * rate;
    usable.push({
      compId: comp.id,
      address: comp.formattedAddress,
      status: comp.status,
      price: comp.price,
      sqft: comp.sqft,
      sqftDifference,
      adjustment,
      adjustedPrice: comp.price + adjustment,
    });
  }

  if (usable.length === 0) {
    const result = emptyResult(subjectSqft, rate, [
      skipped > 0
        ? `All ${skipped} included comp${skipped === 1 ? "" : "s"} are missing a price or a size.`
        : "No usable comps.",
    ]);
    result.skippedForMissingData = skipped;
    result.compNotes = notesWithNothingCounted();
    result.stillToReview = stillToReview;
    return result;
  }

  // Confirmed sales outrank listings outright once there are enough of them.
  const sold = usable.filter((c) => c.status === "sold");
  const soldOnly = sold.length >= SOLD_ONLY_THRESHOLD;
  const basis = soldOnly ? sold : usable;

  const soldCount = basis.filter((c) => c.status === "sold").length;
  const removedCount = basis.filter((c) => c.status === "removed").length;
  const activeCount = basis.filter((c) => c.status === "active").length;

  const adjusted = basis.map((c) => c.adjustedPrice);
  const value = median(adjusted);
  const { low, high } = quartiles(adjusted);

  // The sanity check reads the unadjusted prices, because that is the number
  // someone can verify by looking at the street.
  //
  // Paperwork transfers are left out even when ticked. "Similar homes nearby:
  // $1,000–$462,000" describes no street that exists, and it is the line
  // someone uses to sanity-check the ARV by eye.
  const rawPrices = basis
    .filter((c) => !verdicts.get(c.compId)?.nominalTransfer)
    .map((c) => c.price);
  const nearbyPrices = rawPrices.length > 0 ? rawPrices : basis.map((c) => c.price);
  const nearbyLow = Math.min(...nearbyPrices);
  const nearbyHigh = Math.max(...nearbyPrices);

  // What a counted sale is measured against for the fixer-upper note.
  const countedMedianPrice = median(basis.map((c) => c.price));

  let sanityWarning: string | null = null;
  const overBy = value - nearbyHigh * (1 + SANITY_TOLERANCE_PCT / 100);
  const underBy = nearbyLow * (1 - SANITY_TOLERANCE_PCT / 100) - value;
  if (overBy > 0) {
    sanityWarning =
      `This ARV is ${money(value - nearbyHigh)} above the most expensive home in the set ` +
      `(${money(nearbyHigh)}). Check the size difference before trusting it.`;
  } else if (underBy > 0) {
    sanityWarning =
      `This ARV is ${money(nearbyLow - value)} below the cheapest home in the set ` +
      `(${money(nearbyLow)}). Check the size difference before trusting it.`;
  }

  const confidence: ArvConfidence =
    basis.length >= MIN_APPROVED_FOR_GOOD
      ? "good"
      : basis.length >= MIN_APPROVED_FOR_MODERATE
        ? "moderate"
        : "low";

  const warnings: string[] = [];

  // Say plainly what the number does and does not rest on. No discount is
  // applied anywhere in this file for a listing being a listing, so the
  // screen carries the caveat rather than the arithmetic carrying a guess.
  const listingCount = removedCount + activeCount;
  if (soldCount === 0) {
    warnings.push("None of these are confirmed sales yet. Add sold comps to firm it up.");
  } else if (listingCount > 0) {
    warnings.push(
      `${listingCount} of these ${listingCount === 1 ? "is a listing" : "are listings"}, not a confirmed sale.`
    );
  }

  if (basis.length < MIN_APPROVED_FOR_MODERATE) {
    warnings.push(
      `Only ${basis.length} comp${basis.length === 1 ? "" : "s"} behind this. A median this thin moves a lot on one more sale.`
    );
  }

  if (skipped > 0) {
    warnings.push(
      `${skipped} included comp${skipped === 1 ? " was" : "s were"} skipped for a missing price or size.`
    );
  }

  // A sold set says so. A set of listings says nothing extra here — the
  // warning below already states what they are, and saying it twice in two
  // different ways reads as two different claims.
  const plainSummary =
    `${basis.length} similar home${basis.length === 1 ? "" : "s"}` +
    `${soldOnly ? " that sold" : ""}` +
    `, adjusted for size, point to about ${money(value)}.`;

  const countedIds = new Set(basis.map((c) => c.compId));

  return {
    value,
    valueLow: low,
    valueHigh: high,
    subjectSqft,
    adjustmentPerSqft: rate,
    usedComps: basis,
    soldOnly,
    soldCount,
    removedCount,
    activeCount,
    skippedForMissingData: skipped,
    nearbyLow,
    nearbyHigh,
    sanityWarning,
    confidence,
    warnings,
    basisLabel: buildApprovedLabel(basis.length, stillToReview),
    plainSummary,
    // Every per-comp reason now lives in compNotes. Kept empty so the shape
    // does not change for anything still reading it.
    excludedForFit: [],
    compNotes: buildCompNotes(comps, verdicts, countedIds, countedMedianPrice),
    stillToReview,
    reviewPrompt: null,
    countedTwice,
  };
}

/**
 * What the screen says beside each comp.
 *
 * Built here rather than in the component because three of the four answers
 * depend on the whole set — whether it counted, what the counted median is,
 * and whether a twin exists — and a component recomputing that from a single
 * comp gets it wrong.
 */
function buildCompNotes(
  comps: Comp[],
  verdicts: ReturnType<typeof assessComps>,
  countedIds: Set<string>,
  countedMedianPrice: number | null
): CompNote[] {
  return comps.map((comp) => {
    const verdict = verdicts.get(comp.id);
    const counted = countedIds.has(comp.id);
    return {
      compId: comp.id,
      counted,
      reasons: verdict?.reasons ?? [],
      countedByOverride: counted && verdict !== undefined && !verdict.passes,
      nominalTransfer: verdict?.nominalTransfer ?? false,
      // Never on a comp that is not in the number. A warning about a comp
      // nobody is counting is noise about a decision already made.
      fixerUpper: counted && isPossibleFixer(comp, countedMedianPrice),
    };
  });
}

/**
 * Whether a counted sale might be a fixer rather than a finished house.
 *
 * Narrowed after the first live pull. The old rule flagged anything bought by
 * a company at any price, which put a warning on 1740 Langston Ave at
 * $462,000 — the most expensive sale in the set and obviously not a fixer.
 *
 * A sale at or above what the counted comps fetched is never flagged,
 * whatever bought it. Below that: cheap enough outright, or bought by a
 * company.
 */
export function isPossibleFixer(comp: Comp, countedMedianPrice: number | null): boolean {
  if (comp.price === null || comp.price <= 0) return false;
  if (countedMedianPrice !== null && comp.price >= countedMedianPrice) return false;

  return comp.price < FIXER_PRICE_CEILING || comp.buyerType === ORGANIZATION_BUYER;
}
