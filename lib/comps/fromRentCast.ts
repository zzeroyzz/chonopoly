import {
  type RentCastComparable,
  type RentCastSubjectProperty,
} from "@/lib/rentcast/types";
import { type CompStatus } from "./types";

/**
 * The boundary between RentCast's shapes and ours. Everything past here works
 * in our types, so a change at RentCast is a change in this one file.
 */

/**
 * Active/Inactive → active/removed.
 *
 * This function can never return "sold", and that is the point. RentCast tells
 * us a listing left the market, not that it closed. A withdrawn listing counted
 * as a sale pushes an ARV up with no visible sign anything is wrong, which is
 * the worst kind of wrong number. `sold` is reachable only by someone typing in
 * a comp from an agent's closed-sales list, and the database enforces that with
 * a CHECK rather than trusting this mapper to be the only writer.
 */
export function mapCompStatus(status: string | undefined): CompStatus {
  return status?.toLowerCase() === "inactive" ? "removed" : "active";
}

export interface MappedComp {
  external_id: string | null;
  formatted_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
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
  listing_type: string | null;
  listed_date: string | null;
  removed_date: string | null;
  last_seen_date: string | null;
  days_on_market: number | null;
  distance_miles: number | null;
  days_old: number | null;
  correlation: number | null;
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

/**
 * Returns null for a comp with no usable address — the column is NOT NULL and
 * a row labelled "Unknown address" is worse than one fewer comp, because it
 * still gets counted in "built on 5 comps".
 */
export function mapComparable(comp: RentCastComparable): MappedComp | null {
  const address = textOrNull(comp.formattedAddress) ?? textOrNull(comp.addressLine1);
  if (!address) return null;

  return {
    external_id: textOrNull(comp.id),
    formatted_address: address,
    city: textOrNull(comp.city),
    state: textOrNull(comp.state),
    zip: textOrNull(comp.zipCode),
    latitude: numberOrNull(comp.latitude),
    longitude: numberOrNull(comp.longitude),
    property_type: textOrNull(comp.propertyType),
    beds: numberOrNull(comp.bedrooms),
    baths: numberOrNull(comp.bathrooms),
    sqft: integerOrNull(comp.squareFootage),
    lot_sqft: integerOrNull(comp.lotSize),
    year_built: integerOrNull(comp.yearBuilt),
    price: numberOrNull(comp.price),
    status: mapCompStatus(comp.status),
    listing_type: textOrNull(comp.listingType),
    listed_date: textOrNull(comp.listedDate),
    removed_date: textOrNull(comp.removedDate),
    last_seen_date: textOrNull(comp.lastSeenDate),
    days_on_market: integerOrNull(comp.daysOnMarket),
    distance_miles: numberOrNull(comp.distance),
    days_old: integerOrNull(comp.daysOld),
    correlation: numberOrNull(comp.correlation),
  };
}

export function mapComparables(comps: RentCastComparable[] | undefined): MappedComp[] {
  return (comps ?? []).map(mapComparable).filter((c): c is MappedComp => c !== null);
}

export interface MappedSubjectFacts {
  property_type?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  lot_sqft?: number;
  year_built?: number;
  last_sale_date?: string;
  last_sale_price?: number;
}

/**
 * The subject property's own facts, from the same single call as the comps.
 *
 * Only defined keys are returned, so this can be spread over an existing
 * property row without a null from RentCast erasing something a person entered.
 * The caller must still respect `facts_source`: a hand-corrected sqft outranks
 * an API one.
 */
export function mapSubjectFacts(subject: RentCastSubjectProperty | undefined): MappedSubjectFacts {
  if (!subject) return {};

  const facts: MappedSubjectFacts = {};
  const propertyType = textOrNull(subject.propertyType);
  const beds = numberOrNull(subject.bedrooms);
  const baths = numberOrNull(subject.bathrooms);
  const sqft = integerOrNull(subject.squareFootage);
  const lotSqft = integerOrNull(subject.lotSize);
  const yearBuilt = integerOrNull(subject.yearBuilt);
  const lastSaleDate = textOrNull(subject.lastSaleDate);
  const lastSalePrice = numberOrNull(subject.lastSalePrice);

  if (propertyType !== null) facts.property_type = propertyType;
  if (beds !== null) facts.beds = beds;
  if (baths !== null) facts.baths = baths;
  if (sqft !== null) facts.sqft = sqft;
  if (lotSqft !== null) facts.lot_sqft = lotSqft;
  if (yearBuilt !== null) facts.year_built = yearBuilt;
  if (lastSaleDate !== null) facts.last_sale_date = lastSaleDate;
  if (lastSalePrice !== null) facts.last_sale_price = lastSalePrice;

  return facts;
}
