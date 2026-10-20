/**
 * A comparable sale or listing, in our shape rather than RentCast's.
 *
 * Mirrors the `property_comps` table. Nothing here is optional-because-the-API-
 * might-not-send-it; the mapper has already decided what each field is.
 */

/**
 * What we actually know about this comp's fate.
 *
 * `removed` exists because RentCast reports only Active/Inactive, and an
 * inactive listing might have sold or might have been withdrawn — the API does
 * not say which. Collapsing `removed` into `sold` would be the single easiest
 * way to inflate an ARV, so the two stay apart and the database enforces it:
 * `sold` requires `source = 'manual'`, because only a person can confirm a sale.
 */
export type CompStatus = "active" | "removed" | "sold";

/**
 * Where a comp came from, which decides whether it may claim a sale.
 *
 * `public_record` is a county deed: somebody paid this, on this date. It can
 * assert `sold` for the same reason `manual` can — it is evidence rather than
 * an opinion — and the database CHECK enforces that `rentcast` never can.
 */
export type CompSource = "rentcast" | "manual" | "public_record";

export interface Comp {
  id: string;
  propertyId: string;
  source: CompSource;
  /** RentCast's comparable id. Null for hand-entered comps. */
  externalId: string | null;

  formattedAddress: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;

  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;

  price: number | null;
  status: CompStatus;
  listingType: string | null;
  listedDate: string | null;
  removedDate: string | null;
  lastSeenDate: string | null;
  daysOnMarket: number | null;
  distanceMiles: number | null;
  daysOld: number | null;
  correlation: number | null;

  /**
   * Who bought it, per public records, and which county said so. Only a
   * `public_record` comp has these; they drive the fixer-upper note.
   */
  buyerType: string | null;
  buyerName: string | null;
  county: string | null;

  /** The include checkbox on the Comps tab. */
  included: boolean;
  notes: string | null;

  updatedAt: string;
}

/** What the user can type in by hand. Everything else is derived or defaulted. */
export interface ManualCompInput {
  formattedAddress: string;
  price: number;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  yearBuilt: number | null;
  /**
   * Defaults to "sold" at the call site: a comp someone typed in from an
   * agent's list is a closed sale, which is exactly the evidence RentCast
   * cannot provide.
   */
  status: CompStatus;
  /**
   * When it sold, as "YYYY-MM-DD". Stored in `removed_date`, which for a
   * confirmed sale is exactly what it means — the date the house left the
   * market. Optional, because an agent's list does not always carry it, and a
   * comp with no date is more useful than no comp.
   */
  saleDate: string | null;
  notes: string | null;
}

export const COMP_STATUS_LABELS: Record<CompStatus, string> = {
  active: "Active",
  // Not "Inactive", which says nothing, and emphatically not "Sold".
  removed: "Removed",
  sold: "Sold",
};
