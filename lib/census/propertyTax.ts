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

export interface ResolvedCounty {
  stateFips: string;
  countyFips: string;
  /** Full five-digit FIPS. */
  fips: string;
  countyName: string;
}

/**
 * ZIP to county, via the Census Geocoder.
 *
 * Free and keyless, and it's the same authority that publishes the tax data, so
 * the FIPS codes line up exactly with the ACS query. Must run server-side — the
 * geocoder sends no CORS headers.
 *
 * A ZIP can straddle counties; this returns the one the ZIP's match point falls
 * in, which is why the UI shows which county it picked and lets it be changed.
 */
export async function resolveZipToCounty(zip: string): Promise<ResolvedCounty | null> {
  if (!isValidZip(zip)) return null;

  // Two hops, because the Census geocoder needs a street address and won't match
  // a bare ZIP. Zippopotam gives the ZIP's centroid; the geocoder turns that
  // point into a county — and because the FIPS comes from Census, it lines up
  // exactly with the ACS query that follows.
  const point = await zipCentroid(zip.trim());
  if (!point) return null;

  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/coordinates");
  url.searchParams.set("x", String(point.lon));
  url.searchParams.set("y", String(point.lat));
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("layers", "Counties");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    result?: {
      geographies?: { Counties?: { NAME?: string; STATE?: string; COUNTY?: string }[] };
    };
  };

  const county = json.result?.geographies?.Counties?.[0];
  if (!county?.STATE || !county?.COUNTY) return null;

  return {
    stateFips: county.STATE,
    countyFips: county.COUNTY,
    fips: `${county.STATE}${county.COUNTY}`,
    countyName: county.NAME ?? "",
  };
}

/** ZIP centroid from Zippopotam — free, keyless, no rate limit worth worrying about. */
async function zipCentroid(zip: string): Promise<{ lat: number; lon: number } | null> {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
    next: { revalidate: 60 * 60 * 24 * 365 },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    places?: { latitude?: string; longitude?: string }[];
  };

  const place = json.places?.[0];
  const lat = Number(place?.latitude);
  const lon = Number(place?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lat, lon };
}

export interface CountyTaxRate {
  /** State + county FIPS, e.g. "13089" for DeKalb County, GA. */
  fips: string;
  name: string;
  ratePercent: number;
  medianTaxesPaid: number;
  medianHomeValue: number;
}

/**
 * Effective property tax rate for every county in a state.
 *
 * County is the right geography: millage is levied by county and municipality,
 * a ZIP routinely straddles two counties, and this is the same figure the public
 * tax calculators publish as an "average county tax rate".
 *
 * One request returns the whole state, so the UI can offer a county picker
 * without a round trip per county.
 */
export async function fetchCountyTaxRates(
  stateFips: string,
  apiKey: string
): Promise<CountyTaxRate[]> {
  const url = new URL(BASE);
  url.searchParams.set("get", "NAME,B25103_001E,B25077_001E");
  url.searchParams.set("for", "county:*");
  url.searchParams.set("in", `state:${stateFips}`);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } });
  if (!res.ok) return [];

  const rows = (await res.json()) as string[][];
  const out: CountyTaxRate[] = [];

  // Row shape: [NAME, taxes, value, state, county]
  for (const row of rows.slice(1)) {
    const taxes = Number(row[1]);
    const value = Number(row[2]);
    if (!Number.isFinite(taxes) || !Number.isFinite(value) || taxes < 0 || value <= 0) continue;

    out.push({
      fips: `${row[3]}${row[4]}`,
      // "DeKalb County, Georgia" -> "DeKalb County"
      name: (row[0] ?? "").split(",")[0].trim(),
      ratePercent: (taxes / value) * 100,
      medianTaxesPaid: taxes,
      medianHomeValue: value,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
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
