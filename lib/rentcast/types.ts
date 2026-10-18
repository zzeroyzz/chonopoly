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
