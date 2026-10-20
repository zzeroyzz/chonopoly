/**
 * RentCast's wire shapes for GET /avm/value, confirmed against the docs on
 * 2026-10-18: https://developers.rentcast.io/reference/value-estimate
 *
 * These mirror the API exactly and are not used anywhere outside the client —
 * everything past the client boundary works in our own `Comp` shape. A wire
 * type that leaks into the UI means a change at RentCast becomes a change in
 * fifteen components.
 *
 * Every field is optional on the way in. The docs describe a response; they do
 * not promise one, and a comp with no price or no sqft is a thing this API
 * genuinely returns. Narrowing happens in the mapper, not here.
 */

/**
 * The endpoints we call, named once.
 *
 * These are part of the 30-day cache key and the in-flight lock key, so a
 * stray string literal in one caller quietly creates a second bucket for the
 * same endpoint. Import these; never retype them.
 *
 * Here rather than in client.ts because client.ts is `server-only`, and the
 * read-only diagnosis script needs them too.
 */
export const VALUE_ESTIMATE_ENDPOINT = "/avm/value";
export const PROPERTY_RECORDS_ENDPOINT = "/properties";

/**
 * One sale event from a property record's `history`.
 *
 * `history` is an OBJECT keyed by "YYYY-MM-DD", not an array — confirmed
 * against a real response on 2026-10-20. Iterate `Object.values()`; indexing
 * `[0]` returns undefined. The only `event` value observed is "Sale".
 */
export interface RentCastSaleEvent {
  date?: string;
  event?: string;
  price?: number;
}

/** The current owner, per public records. An object, not a string. */
export interface RentCastRecordOwner {
  type?: string;
  names?: string[];
  mailingAddress?: Record<string, unknown>;
}

/**
 * One public-record property from GET /properties.
 *
 * Shapes confirmed against a live response for 1653 Sylvan Rd SW on
 * 2026-10-20, not from the docs alone.
 *
 * There is no listing price, listing status or listing date here. This
 * endpoint knows about the deed, not the market — which is the entire reason
 * to call it.
 */
export interface RentCastPropertyRecord {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  lastSaleDate?: string;
  lastSalePrice?: number;
  owner?: RentCastRecordOwner;
  history?: Record<string, RentCastSaleEvent>;
}

/** What GET /properties takes. Ranges are supported but deliberately unused. */
export interface PropertyRecordsParams {
  address: string;
  /** Miles. */
  radius?: number;
  propertyType?: string;
  /** Days since the last sale. 365 = the last twelve months. */
  saleDateRange?: number;
  limit?: number;
}

export interface RentCastSubjectProperty {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  lastSaleDate?: string;
  lastSalePrice?: number;
}

export interface RentCastComparable {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  /**
   * "Active" or "Inactive" — NOT sold or listed. An inactive comp was removed
   * from the market; RentCast does not say whether it sold or the seller gave
   * up. See the mapper for how this is translated, and why it can never produce
   * a "sold".
   */
  status?: string;
  price?: number;
  listingType?: string;
  listedDate?: string;
  removedDate?: string;
  lastSeenDate?: string;
  daysOnMarket?: number;
  /** Miles from the subject property. */
  distance?: number;
  daysOld?: number;
  /** RentCast's own similarity score, 0–1. Results arrive sorted by it. */
  correlation?: number;
}

export interface RentCastValueResponse {
  price?: number;
  priceRangeLow?: number;
  priceRangeHigh?: number;
  subjectProperty?: RentCastSubjectProperty;
  comparables?: RentCastComparable[];
}

/** Parameters we actually send. Names and ranges confirmed against the docs. */
export interface ValueEstimateParams {
  address: string;
  /** 5–25, RentCast's default is 15. */
  compCount?: number;
  /** Miles. */
  maxRadius?: number;
  /** Minimum 1. */
  daysOld?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
}
