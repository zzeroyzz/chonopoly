import { type Comp, type CompStatus } from "./types";

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
} as const;

/** At least this many sold comps and the listings stop being used at all. */
const SOLD_ONLY_THRESHOLD = 2;

/** Below this, a median is one opinion rather than a market. */
const MIN_COMPS_FOR_MODERATE = 5;
const MIN_COMPS_FOR_GOOD = 8;

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

  confidence: ArvConfidence;
  warnings: string[];
  /** e.g. "3 sold · 2 removed listings" */
  basisLabel: string;
  /** "5 similar homes, adjusted for size, point to about $345,000." */
  plainSummary: string | null;
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

function buildBasisLabel(sold: number, removed: number, active: number): string {
  const parts: string[] = [];
  if (sold > 0) parts.push(`${sold} sold`);
  if (removed > 0) parts.push(`${removed} removed listing${removed === 1 ? "" : "s"}`);
  if (active > 0) parts.push(`${active} active listing${active === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : "no comps";
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
  subjectBeds: number | null
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

  return { compId: comp.id, eligible: reasons.length === 0, reasons };
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
    confidence: "none",
    warnings,
    basisLabel: "no comps",
    plainSummary: null,
  };
}

export interface ArvOptions {
  /** Dollars per square foot of difference. Defaults to the shared constant. */
  adjustmentPerSqft?: number;
  /** The subject's bed count, for the eligibility reasons. */
  subjectBeds?: number | null;
}

export function calculateArv(
  comps: Comp[],
  subjectSqft: number | null,
  options: ArvOptions = {}
): ArvResult {
  const rate = Math.max(0, options.adjustmentPerSqft ?? DEFAULT_SIZE_ADJUSTMENT_PER_SQFT);

  // Unchecked comps are not part of the answer. This is the whole point of the
  // include checkbox, and it is tested directly.
  const included = comps.filter((comp) => comp.included);

  if (included.length === 0) {
    return emptyResult(subjectSqft, rate, ["No comps are included yet."]);
  }

  // Size is still needed, but only to measure the difference — not as a
  // multiplier. A missing size now costs an adjustment, not the whole ARV.
  if (subjectSqft === null || subjectSqft <= 0) {
    return emptyResult(subjectSqft, rate, [
      "Add this house's square footage to get an ARV.",
    ]);
  }

  const usable: ArvCompBreakdown[] = [];
  let skipped = 0;

  for (const comp of included) {
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
  const rawPrices = basis.map((c) => c.price);
  const nearbyLow = Math.min(...rawPrices);
  const nearbyHigh = Math.max(...rawPrices);

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
    basis.length >= MIN_COMPS_FOR_GOOD
      ? "good"
      : basis.length >= MIN_COMPS_FOR_MODERATE
        ? "moderate"
        : "low";

  const warnings: string[] = [];

  if (soldCount === 0) {
    warnings.push(
      "None of these are confirmed sales. RentCast only knows they left the market. Add a sold comp from your agent to firm it up."
    );
  }

  if (basis.length < MIN_COMPS_FOR_MODERATE) {
    warnings.push(
      `Only ${basis.length} comp${basis.length === 1 ? "" : "s"} behind this. A median this thin moves a lot on one more sale.`
    );
  }

  if (skipped > 0) {
    warnings.push(
      `${skipped} included comp${skipped === 1 ? " was" : "s were"} skipped for a missing price or size.`
    );
  }

  const plainSummary =
    `${basis.length} similar home${basis.length === 1 ? "" : "s"}` +
    `${soldOnly ? " that sold" : ""}, adjusted for size, point to about ${money(value)}.`;

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
    basisLabel: buildBasisLabel(soldCount, removedCount, activeCount),
    plainSummary,
  };
}
