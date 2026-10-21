import {
  type RentCastPropertyRecord,
  type RentCastSaleEvent,
} from "@/lib/rentcast/types";
import { type CompStatus } from "./types";

/**
 * The boundary between RentCast's property-record shapes and ours.
 *
 * Separate from `fromRentCast.ts` on purpose: that file is the `/avm/value`
 * boundary and still maps the listings already stored against old houses. Two
 * endpoints, two boundaries, so a change at either is a change in one place.
 *
 * Everything here becomes a `sold` comp. A county record is a deed: somebody
 * paid this, on this date. That is the one thing `/avm/value` could never say.
 */

/** Companies buy to renovate. Individuals mostly buy to live in. */
export const ORGANIZATION_BUYER = "Organization";

export interface MappedRecordedSale {
  external_id: string | null;
  formatted_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  price: number | null;
  status: CompStatus;
  /** For a confirmed sale the date it left the market IS the sale date. */
  removed_date: string | null;
  buyer_type: string | null;
  buyer_name: string | null;
}

function numberOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerOrNull(value: number | undefined): number | null {
  const n = numberOrNull(value);
  return n === null ? null : Math.round(n);
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** "2026-05-15T00:00:00.000Z" -> "2026-05-15". The column is a date. */
function dateOrNull(value: string | undefined): string | null {
  const text = textOrNull(value);
  return text ? text.slice(0, 10) : null;
}

/**
 * The most recent sale on file, from the `history` object.
 *
 * `history` is keyed by "YYYY-MM-DD" rather than being an array, so this
 * iterates values. Used only as a fallback: `lastSalePrice` is the figure
 * RentCast itself considers current, and on the one live response it was
 * present on all ten records.
 */
export function latestSale(
  history: Record<string, RentCastSaleEvent> | undefined
): RentCastSaleEvent | null {
  const sales = Object.values(history ?? {})
    .filter((event) => event?.event === "Sale" && typeof event.date === "string")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return sales.length > 0 ? sales[sales.length - 1] : null;
}

// The fixer-upper test moved to arv.ts, which is the only place that knows
// what the counted comps fetched — the rule now needs that median, and a
// sale at or above it is never flagged whatever bought it.

/**
 * Null for a record with no usable address or no sale price.
 *
 * No price means it cannot move an ARV, and a zero posing as a sale price is
 * the worst outcome available here — it would drag a median toward nothing
 * while looking like evidence.
 */
export function mapPropertyRecord(record: RentCastPropertyRecord): MappedRecordedSale | null {
  const address = textOrNull(record.formattedAddress) ?? textOrNull(record.addressLine1);
  if (!address) return null;

  const fallback = latestSale(record.history);
  const price = numberOrNull(record.lastSalePrice) ?? numberOrNull(fallback?.price);
  if (price === null || price <= 0) return null;

  return {
    external_id: textOrNull(record.id),
    formatted_address: address,
    city: textOrNull(record.city),
    state: textOrNull(record.state),
    zip: textOrNull(record.zipCode),
    county: textOrNull(record.county),
    latitude: numberOrNull(record.latitude),
    longitude: numberOrNull(record.longitude),
    property_type: textOrNull(record.propertyType),
    beds: numberOrNull(record.bedrooms),
    baths: numberOrNull(record.bathrooms),
    sqft: integerOrNull(record.squareFootage),
    lot_sqft: integerOrNull(record.lotSize),
    year_built: integerOrNull(record.yearBuilt),
    price,
    // The whole point. A deed is evidence in the way a listing is not, and
    // the database CHECK allows this only from source = 'public_record'.
    status: "sold",
    removed_date: dateOrNull(record.lastSaleDate) ?? dateOrNull(fallback?.date),
    buyer_type: textOrNull(record.owner?.type),
    buyer_name: textOrNull(record.owner?.names?.[0]),
  };
}

export function mapPropertyRecords(
  records: RentCastPropertyRecord[] | undefined
): MappedRecordedSale[] {
  return (records ?? [])
    .map(mapPropertyRecord)
    .filter((record): record is MappedRecordedSale => record !== null);
}
