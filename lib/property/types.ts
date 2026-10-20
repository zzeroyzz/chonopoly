export type PropertyType =
  | "single_family"
  | "multi_family"
  | "condo"
  | "townhouse"
  | "land"
  | "mobile"
  | "other";

export type PropertyOrigin = "manual" | "analysis" | "import" | "inbound_web" | "crm";

export interface Property {
  id: string;
  owner_type: "personal" | "team";
  owner_id: string;
  address_line1: string;
  city: string | null;
  county: string | null;
  state: string;
  zip: string | null;
  parcel_number: string | null;
  address_hash: string;
  needs_address_review: boolean;
  origin: PropertyOrigin;
  property_type: PropertyType;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  photo_url: string | null;
  /** The listing page, so the photos are one tap away when estimating. */
  listing_url?: string | null;
  /**
   * What the house is on the market for. Null when nobody has said — never a
   * calculator default standing in for one.
   */
  list_price?: number | null;
  /** Stamped when a walkthrough is recorded. Drives the progress checklist. */
  visit_completed_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Fields a caller may supply when creating or matching a property. */
export interface PropertyInput {
  address_line1: string;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  zip?: string | null;
  parcel_number?: string | null;
  property_type?: PropertyType;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lot_sqft?: number | null;
  year_built?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  photo_url?: string | null;
  /** The listing page, so the photos are one tap away when estimating. */
  listing_url?: string | null;
  /** What the house is on the market for. */
  list_price?: number | null;
}

/** How an upsert resolved — surfaced so callers can explain a merge to the user. */
export type PropertyMatch = "parcel" | "address" | "created";

export interface UpsertPropertyResult {
  property: Property;
  matchedOn: PropertyMatch;
}

/**
 * Readable names for the stored property types.
 *
 * The column holds snake_case values, and showing "single_family" on a detail
 * page is showing the database to the user.
 */
export const PROPERTY_TYPE_LABEL: Record<string, string> = {
  single_family: "Single family",
  multi_family: "Multi-family",
  condo: "Condo",
  townhouse: "Townhouse",
  land: "Land",
  mobile: "Mobile home",
  other: "Other",
};

/** Falls back to the raw value rather than hiding an unexpected one. */
export function propertyTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return PROPERTY_TYPE_LABEL[value] ?? value;
}
