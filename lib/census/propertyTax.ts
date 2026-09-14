/**
 * Effective property tax rate by ZIP, derived from Census ACS 5-year estimates.
 *
 * Deliberately not a model-generated number. A tax rate is an input to the math,
 * not a research answer — a plausible-sounding guess produces a max-price figure
 * that's wrong by tens of thousands with nothing about the output looking wrong.
 *
 * What this actually is: median real estate taxes paid divided by median home
 * value, across the ZCTA. That's a ZIP-level average, not the parcel's bill, so
 * it's a starting estimate — a sourced one rather than an invented one. The
 * field it fills stays editable and a real tax bill always wins.
 *
 * Known limitation, and it's a real one: in states with assessment caps that
 * reset on sale (California's Prop 13 is the obvious case), the median mixes
 * long-held homes carrying decades-old assessments with recently sold ones. A
 * new buyer reassessed to purchase price pays materially more than this ratio
 * suggests. Verified against 94110, which returns 0.66% where a new purchase
 * would be closer to 1.2%. Georgia — the owner's market — has no such cap, so
 * the estimate holds there.
 *
 * B25103_001E — median real estate taxes paid (dollars)
 * B25077_001E — median home value (dollars)
 */

const ACS_VINTAGE = "2023";
const BASE = `https://api.census.gov/data/${ACS_VINTAGE}/acs/acs5`;

export interface PropertyTaxEstimate {
  zip: string;
  /** Effective annual rate as a percent of value, e.g. 1.02 */
  ratePercent: number;
  medianTaxesPaid: number;
  medianHomeValue: number;
  source: string;
  vintage: string;
}

export function isValidZip(zip: string): boolean {
  return /^\d{5}$/.test(zip.trim());
}

/**
 * Returns null rather than throwing when the ZIP has no usable data — plenty of
 * ZCTAs report suppressed or negative-coded values, and a missing estimate is a
 * normal outcome, not an error.
 */
export async function fetchPropertyTaxRate(
  zip: string,
  apiKey: string
): Promise<PropertyTaxEstimate | null> {
  if (!isValidZip(zip)) return null;

  const url = new URL(BASE);
  url.searchParams.set("get", "B25103_001E,B25077_001E");
  url.searchParams.set("for", `zip code tabulation area:${zip.trim()}`);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } });
  if (!res.ok) return null;

  // Census returns [[header...], [row...]]
  const json = (await res.json()) as string[][];
  const row = json?.[1];
  if (!row) return null;

  const taxes = Number(row[0]);
  const value = Number(row[1]);

  // Census encodes suppressed and unavailable values as large negatives.
  if (!Number.isFinite(taxes) || !Number.isFinite(value) || taxes < 0 || value <= 0) {
    return null;
  }

  return {
    zip: zip.trim(),
    ratePercent: (taxes / value) * 100,
    medianTaxesPaid: taxes,
    medianHomeValue: value,
    source: "U.S. Census Bureau, ACS 5-Year Estimates",
    vintage: ACS_VINTAGE,
  };
}
