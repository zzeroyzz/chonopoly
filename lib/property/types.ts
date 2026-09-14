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
}

/** How an upsert resolved — surfaced so callers can explain a merge to the user. */
export type PropertyMatch = "parcel" | "address" | "created";

export interface UpsertPropertyResult {
  property: Property;
  matchedOn: PropertyMatch;
}
