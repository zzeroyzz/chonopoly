import { type Comp, type CompStatus } from "./types";

/**
 * After-repair value from comparable sales.
 *
 * Method: median price per square foot across the included comps, times the
 * subject's square footage.
 *
 * Median rather than mean, deliberately. Comp sets are small — often five to
 * fifteen — and one estate sale or one flipped-to-the-studs renovation drags a
 * mean far enough to change the verdict. The median ignores it.
 *
 * Price per square foot rather than a straight price average, because the comps
 * are not the same size as the subject. Averaging the prices of three houses
 * that are 20% larger produces an ARV that is 20% too high, and nothing about
 * the number looks wrong.
 *
 * Sold and removed comps are weighted the same, which is a decision worth
 * stating: sold comps are better evidence, but weighting introduces a hidden
 * multiplier nobody can check against the figures on screen. Instead the result
 * reports its own mix — "3 sold · 2 removed listings" — and flags a set with no
 * confirmed sales in it, so the judgement stays with the person making the
 * offer rather than disappearing into a coefficient.
 */

/** A comp needs both a price and a size to say anything about price per sqft. */
export interface ArvCompBreakdown {
  compId: string;
  address: string;
  status: CompStatus;
  price: number;
  sqft: number;
  pricePerSqft: number;
}

export type ArvConfidence = "none" | "low" | "moderate" | "good";

export interface ArvResult {
  /** Null when nothing usable was included — never a zero posing as a value. */
  value: number | null;
  valueLow: number | null;
  valueHigh: number | null;

  medianPricePerSqft: number | null;
  subjectSqft: number | null;

  /** The comps that actually moved the number, with their arithmetic shown. */
  usedComps: ArvCompBreakdown[];

  soldCount: number;
  removedCount: number;
  activeCount: number;

  /**
   * Included comps that had to be skipped for want of a price or a size.
   * Surfaced rather than silently dropped: "built on 5 comps" when you ticked
   * nine is a question the screen should answer before it is asked.
   */
  skippedForMissingData: number;

  confidence: ArvConfidence;
  /** Plain-language caveats to show under the number. */
  warnings: string[];
  /** e.g. "3 sold · 2 removed listings" */
  basisLabel: string;
}

/** Below this, a median is one opinion rather than a market. */
const MIN_COMPS_FOR_MODERATE = 5;
const MIN_COMPS_FOR_GOOD = 8;

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

function buildBasisLabel(sold: number, removed: number, active: number): string {
  const parts: string[] = [];
  if (sold > 0) parts.push(`${sold} sold`);
  if (removed > 0) parts.push(`${removed} removed listing${removed === 1 ? "" : "s"}`);
  if (active > 0) parts.push(`${active} active listing${active === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : "no comps";
}

function emptyResult(subjectSqft: number | null, warnings: string[]): ArvResult {
  return {
    value: null,
    valueLow: null,
    valueHigh: null,
    medianPricePerSqft: null,
    subjectSqft,
    usedComps: [],
    soldCount: 0,
    removedCount: 0,
    activeCount: 0,
    skippedForMissingData: 0,
    confidence: "none",
    warnings,
    basisLabel: "no comps",
  };
}

export function calculateArv(comps: Comp[], subjectSqft: number | null): ArvResult {
  // Unchecked comps are not part of the answer. This is the whole point of the
  // include checkbox, and it is tested directly.
  const included = comps.filter((comp) => comp.included);

  if (included.length === 0) {
    return emptyResult(subjectSqft, ["No comps are included yet."]);
  }

  if (subjectSqft === null || subjectSqft <= 0) {
    return emptyResult(subjectSqft, [
      "This property has no square footage, so price per square foot cannot be applied. Add the size to get an ARV.",
    ]);
  }

  const usable: ArvCompBreakdown[] = [];
  let skipped = 0;

  for (const comp of included) {
    if (comp.price === null || comp.price <= 0 || comp.sqft === null || comp.sqft <= 0) {
      skipped++;
      continue;
    }
    usable.push({
      compId: comp.id,
      address: comp.formattedAddress,
      status: comp.status,
      price: comp.price,
      sqft: comp.sqft,
      pricePerSqft: comp.price / comp.sqft,
    });
  }

  // Counts describe the comps the number is actually built on, not everything
  // that happened to be ticked — the label has to match the arithmetic.
  const soldCount = usable.filter((c) => c.status === "sold").length;
  const removedCount = usable.filter((c) => c.status === "removed").length;
  const activeCount = usable.filter((c) => c.status === "active").length;

  if (usable.length === 0) {
    const result = emptyResult(subjectSqft, [
      skipped > 0
        ? `All ${skipped} included comp${skipped === 1 ? "" : "s"} are missing a price or a size.`
        : "No usable comps.",
    ]);
    result.skippedForMissingData = skipped;
    return result;
  }

  const perSqft = usable.map((c) => c.pricePerSqft);
  const medianPerSqft = median(perSqft);
  const { low, high } = quartiles(perSqft);

  const confidence: ArvConfidence =
    usable.length >= MIN_COMPS_FOR_GOOD
      ? "good"
      : usable.length >= MIN_COMPS_FOR_MODERATE
        ? "moderate"
        : "low";

  const warnings: string[] = [];

  if (soldCount === 0) {
    warnings.push(
      "No confirmed sales. A removed listing left the market but may not have sold, so treat this as a ceiling rather than a value."
    );
  }

  if (usable.length < MIN_COMPS_FOR_MODERATE) {
    warnings.push(
      `Only ${usable.length} usable comp${usable.length === 1 ? "" : "s"}. A median this thin moves a lot on one more sale.`
    );
  }

  if (skipped > 0) {
    warnings.push(
      `${skipped} included comp${skipped === 1 ? " was" : "s were"} skipped for a missing price or size.`
    );
  }

  return {
    value: medianPerSqft * subjectSqft,
    valueLow: low * subjectSqft,
    valueHigh: high * subjectSqft,
    medianPricePerSqft: medianPerSqft,
    subjectSqft,
    usedComps: usable,
    soldCount,
    removedCount,
    activeCount,
    skippedForMissingData: skipped,
    confidence,
    warnings,
    basisLabel: buildBasisLabel(soldCount, removedCount, activeCount),
  };
}
