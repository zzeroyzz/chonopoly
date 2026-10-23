/**
 * An address to a point on the map, via the US Census geocoder.
 *
 * Free and keyless, and it costs none of the fifty monthly RentCast requests.
 * Server-side only: the geocoder sends no CORS headers.
 *
 * Kept apart from `propertyTax.ts`, which turns ZIPs into counties for tax
 * rates. The two share a host and nothing else.
 *
 * Never throws. A house that cannot be placed still saves; it just is not on
 * the map, and the map says how many are missing.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeAddress {
  addressLine1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

const ENDPOINT = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
/** A save waits on this, so it gives up rather than hang the form. */
const TIMEOUT_MS = 5_000;

/** The one line the geocoder matches against: "674 White Bird Way, Fairburn, GA 30213". */
export function oneLineAddress(address: GeocodeAddress): string {
  const stateZip = [address.state, address.zip].filter(Boolean).join(" ");
  return [address.addressLine1, address.city, stateZip]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * The first match's point, or null when there is none.
 *
 * The geocoder reports longitude as `x` and latitude as `y`. Pure, so the
 * reply's shape is tested without a network.
 */
export function parseGeocodeReply(reply: unknown): Coordinates | null {
  if (typeof reply !== "object" || reply === null) return null;
  const result = (reply as { result?: unknown }).result;
  if (typeof result !== "object" || result === null) return null;
  const matches = (result as { addressMatches?: unknown }).addressMatches;
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const coordinates = (matches[0] as { coordinates?: unknown }).coordinates;
  if (typeof coordinates !== "object" || coordinates === null) return null;
  const { x, y } = coordinates as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(y) > 90 || Math.abs(x) > 180) return null;

  return { latitude: y, longitude: x };
}

export async function geocodeAddress(address: GeocodeAddress): Promise<Coordinates | null> {
  const line = oneLineAddress(address);
  if (!line) return null;

  const url = new URL(ENDPOINT);
  url.searchParams.set("address", line);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) {
      console.warn(`Geocoder returned ${res.status}; house saved without a map location.`);
      return null;
    }
    return parseGeocodeReply(await res.json());
  } catch (error) {
    // Reported, not thrown: a slow or down geocoder must not lose a save.
    console.warn(
      "Geocoder unreachable; house saved without a map location.",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
