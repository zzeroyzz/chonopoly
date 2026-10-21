import { createClient } from "@supabase/supabase-js";
import { type Database } from "../supabase/database.types";
import { type RequestContext } from "../context";
import {
  type Comp,
  type CompStatus,
  type CompReview,
  type ManualCompInput,
} from "./types";
import { assertNotMockMode } from "../rentcast/client";
import { type MappedComp, type MappedSubjectFacts } from "./fromRentCast";
import { type MappedRecordedSale } from "./fromPropertyRecords";

/**
 * Reading and writing comps, and the RentCast usage log.
 *
 * Service-role client, same as propertyService: every call has already resolved
 * a context, and the owner filter is applied explicitly on every query rather
 * than left to RLS. Both layers agree, which means a bug in either one is
 * caught by the other.
 */

/**
 * Typed against the generated schema (`lib/supabase/database.types.ts`), so a
 * column that does not exist is a compile error instead of a 500. Regenerate
 * with `npm run db:types` after every migration.
 */
function db() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface CompRow {
  id: string;
  property_id: string;
  source: string;
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
  status: string;
  listing_type: string | null;
  listed_date: string | null;
  removed_date: string | null;
  last_seen_date: string | null;
  days_on_market: number | null;
  distance_miles: number | null;
  days_old: number | null;
  correlation: number | null;
  review: string;
  review_set_at: string | null;
  sale_price: number | null;
  sale_date: string | null;
  buyer_type: string | null;
  buyer_name: string | null;
  county: string | null;
  included: boolean;
  notes: string | null;
  updated_at: string;
}

/**
 * Built from `keyof Row` rather than written as free text, so a column that
 * does not exist is a compile error. A typed client alone does not catch this:
 * supabase-js does not validate column names inside a `.select()` string.
 */
type CompColumn = keyof Database["public"]["Tables"]["property_comps"]["Row"];

const COMP_FIELDS: CompColumn[] = [
  "id",
  "property_id",
  "source",
  "external_id",
  "formatted_address",
  "city",
  "state",
  "zip",
  "latitude",
  "longitude",
  "property_type",
  "beds",
  "baths",
  "sqft",
  "lot_sqft",
  "year_built",
  "price",
  "status",
  "listing_type",
  "listed_date",
  "removed_date",
  "last_seen_date",
  "days_on_market",
  "distance_miles",
  "days_old",
  "correlation",
  "review",
  "review_set_at",
  "sale_price",
  "sale_date",
  "buyer_type",
  "buyer_name",
  "county",
  "included",
  "notes",
  "updated_at",
];

const COMP_COLUMNS = COMP_FIELDS.join(",");

function toComp(row: CompRow): Comp {
  return {
    id: row.id,
    propertyId: row.property_id,
    source:
      row.source === "manual" || row.source === "public_record"
        ? row.source
        : "rentcast",
    externalId: row.external_id,
    formattedAddress: row.formatted_address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    propertyType: row.property_type,
    beds: row.beds === null ? null : Number(row.beds),
    baths: row.baths === null ? null : Number(row.baths),
    sqft: row.sqft,
    lotSqft: row.lot_sqft,
    yearBuilt: row.year_built,
    price: row.price === null ? null : Number(row.price),
    status: row.status as CompStatus,
    listingType: row.listing_type,
    listedDate: row.listed_date,
    removedDate: row.removed_date,
    lastSeenDate: row.last_seen_date,
    daysOnMarket: row.days_on_market,
    distanceMiles: row.distance_miles === null ? null : Number(row.distance_miles),
    daysOld: row.days_old,
    correlation: row.correlation === null ? null : Number(row.correlation),
    review: row.review as CompReview,
    reviewSetAt: row.review_set_at,
    salePrice: row.sale_price === null ? null : Number(row.sale_price),
    saleDate: row.sale_date,
    buyerType: row.buyer_type,
    buyerName: row.buyer_name,
    county: row.county,
    included: row.included,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export async function listComps(propertyId: string, ctx: RequestContext): Promise<Comp[]> {
  const { data, error } = await db()
    .from("property_comps")
    .select(COMP_COLUMNS)
    .eq("property_id", propertyId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .order("correlation", { ascending: false, nullsFirst: false });

  if (error) throw new Error(`Failed to load comps: ${error.message}`);
  return (data ?? []).map((row) => toComp(row as unknown as CompRow));
}

/**
 * Store a fresh set of RentCast comps for a property.
 *
 * Read the existing comps, update the ones we already hold, insert the rest —
 * deliberately NOT an upsert.
 *
 * `ON CONFLICT (property_id, source, external_id)` cannot work here: the unique
 * index backing those columns is partial (`WHERE external_id IS NOT NULL`), and
 * PostgreSQL will only infer a partial index when the statement repeats its
 * predicate, which PostgREST has no way to send. The upsert that used to be
 * here therefore failed with "no unique or exclusion constraint matching the
 * ON CONFLICT specification" on every live refresh — after the RentCast call
 * had already been made and billed.
 *
 * The index stays as it is. It still does its job as a duplicate guard, and
 * widening it to non-partial to suit one query would be the wrong way round.
 *
 * `included` is never written on an update: a refresh must not silently re-tick
 * a comp the user excluded on purpose, which would move the ARV with no visible
 * cause.
 */
export async function saveRentCastComps(
  propertyId: string,
  comps: MappedComp[],
  ctx: RequestContext,
  userId: string
): Promise<Comp[]> {
  // Fixture comps are not comps. Six Duluth addresses once landed on a house
  // in Atlanta this way.
  assertNotMockMode("RentCast comps");

  if (comps.length === 0) return listComps(propertyId, ctx);

  const { data: existingRows, error: readError } = await db()
    .from("property_comps")
    .select("id, external_id")
    .eq("property_id", propertyId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("source", "rentcast");

  if (readError) throw new Error(`Failed to read existing comps: ${readError.message}`);

  const idByExternalId = new Map<string, string>();
  for (const row of existingRows ?? []) {
    if (row.external_id) idByExternalId.set(row.external_id, row.id);
  }

  const now = new Date().toISOString();
  const toInsert: MappedComp[] = [];
  const updates: { id: string; comp: MappedComp }[] = [];

  for (const comp of comps) {
    const existingId = comp.external_id ? idByExternalId.get(comp.external_id) : undefined;
    if (existingId) updates.push({ id: existingId, comp });
    else toInsert.push(comp);
  }

  if (toInsert.length > 0) {
    const { error } = await db()
      .from("property_comps")
      .insert(
        toInsert.map((comp) => ({
          ...comp,
          property_id: propertyId,
          owner_type: ctx.type,
          owner_id: ctx.id,
          source: "rentcast",
          created_by: userId,
          updated_at: now,
        }))
      );
    if (error) throw new Error(`Failed to save comps: ${error.message}`);
  }

  // Sequential rather than one statement per the whole set: PostgREST has no
  // multi-row update, and a comp set is at most 25 rows.
  for (const { id, comp } of updates) {
    const { error } = await db()
      .from("property_comps")
      .update({
        price: comp.price,
        status: comp.status,
        sqft: comp.sqft,
        beds: comp.beds,
        baths: comp.baths,
        lot_sqft: comp.lot_sqft,
        year_built: comp.year_built,
        listing_type: comp.listing_type,
        listed_date: comp.listed_date,
        removed_date: comp.removed_date,
        last_seen_date: comp.last_seen_date,
        days_on_market: comp.days_on_market,
        distance_miles: comp.distance_miles,
        days_old: comp.days_old,
        correlation: comp.correlation,
        updated_at: now,
      })
      .eq("id", id)
      .eq("owner_type", ctx.type)
      .eq("owner_id", ctx.id);
    if (error) throw new Error(`Failed to update a comp: ${error.message}`);
  }

  return listComps(propertyId, ctx);
}

/**
 * Store recorded sales from county records.
 *
 * Same read-update-insert shape as `saveRentCastComps` and for the same
 * reason: the unique index on (property_id, source, external_id) is partial,
 * so PostgREST cannot drive an upsert against it.
 *
 * Scoped to `source = 'public_record'` throughout, so this can never touch a
 * listing or a hand-entered sale. The two sets live side by side on a house
 * that has both.
 *
 * `included` is never written on an update, exactly as for listings: a
 * refresh must not silently re-tick a sale the owner unticked as a probable
 * fixer-upper, which would move the ARV with no visible cause.
 */
export async function savePublicRecordComps(
  propertyId: string,
  sales: MappedRecordedSale[],
  ctx: RequestContext,
  userId: string
): Promise<Comp[]> {
  // Mock mode has no /properties fixture, so there is nothing legitimate to
  // write here — and inventing sale prices is worse than storing none.
  assertNotMockMode("recorded sales");

  if (sales.length === 0) return listComps(propertyId, ctx);

  const { data: existingRows, error: readError } = await db()
    .from("property_comps")
    .select("id, external_id")
    .eq("property_id", propertyId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("source", "public_record");

  if (readError) throw new Error(`Failed to read existing sales: ${readError.message}`);

  const idByExternalId = new Map<string, string>();
  for (const row of existingRows ?? []) {
    if (row.external_id) idByExternalId.set(row.external_id, row.id);
  }

  const now = new Date().toISOString();
  const toInsert: MappedRecordedSale[] = [];
  const updates: { id: string; sale: MappedRecordedSale }[] = [];

  for (const sale of sales) {
    const existingId = sale.external_id ? idByExternalId.get(sale.external_id) : undefined;
    if (existingId) updates.push({ id: existingId, sale });
    else toInsert.push(sale);
  }

  if (toInsert.length > 0) {
    const { error } = await db()
      .from("property_comps")
      .insert(
        toInsert.map((sale) => ({
          ...sale,
          property_id: propertyId,
          owner_type: ctx.type,
          owner_id: ctx.id,
          source: "public_record",
          created_by: userId,
          updated_at: now,
        }))
      );
    if (error) throw new Error(`Failed to save the recorded sales: ${error.message}`);
  }

  for (const { id, sale } of updates) {
    const { error } = await db()
      .from("property_comps")
      .update({
        price: sale.price,
        status: sale.status,
        sqft: sale.sqft,
        beds: sale.beds,
        baths: sale.baths,
        lot_sqft: sale.lot_sqft,
        year_built: sale.year_built,
        removed_date: sale.removed_date,
        buyer_type: sale.buyer_type,
        buyer_name: sale.buyer_name,
        county: sale.county,
        updated_at: now,
      })
      .eq("id", id)
      .eq("owner_type", ctx.type)
      .eq("owner_id", ctx.id);
    if (error) throw new Error(`Failed to update a recorded sale: ${error.message}`);
  }

  return listComps(propertyId, ctx);
}

/**
 * Add a comp by hand, from an agent's closed-sales list.
 *
 * Defaults to `sold`, because that is the whole reason to type one in: it is
 * confirmed-sale evidence, which RentCast cannot supply. A CHECK on the table
 * ensures only `source = 'manual'` rows can claim it.
 */
export async function addManualComp(
  propertyId: string,
  input: ManualCompInput,
  ctx: RequestContext,
  userId: string
): Promise<Comp> {
  const address = input.formattedAddress.trim();
  if (!address) throw new Error("A comp needs an address.");
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new Error("A comp needs a sale price above zero.");
  }

  const { data, error } = await db()
    .from("property_comps")
    .insert({
      property_id: propertyId,
      owner_type: ctx.type,
      owner_id: ctx.id,
      source: "manual",
      external_id: null,
      formatted_address: address,
      price: input.price,
      sqft: input.sqft,
      beds: input.beds,
      baths: input.baths,
      year_built: input.yearBuilt,
      status: input.status,
      // For a confirmed sale, the date it left the market IS the sale date.
      removed_date: input.saleDate,
      notes: input.notes,
      included: true,
      // Typing a comp in IS the review. Asking the owner to approve a comp
      // they just entered by hand would be asking the same question twice.
      review: "renovated_use",
      review_set_by: userId,
      review_set_at: new Date().toISOString(),
      created_by: userId,
    })
    .select(COMP_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to add the comp: ${error.message}`);
  return toComp(data as unknown as CompRow);
}

/**
 * Record the owner's judgement on one comp.
 *
 * The only thing that moves the ARV. `review_set_by` comes from the session,
 * never from the request body — a claim needs an author, and the database
 * CHECK enforces that anything other than the default has one.
 */
export async function setCompReview(
  compId: string,
  review: CompReview,
  ctx: RequestContext,
  userId: string,
  sale: { price: number | null; date: string | null } = { price: null, date: null }
): Promise<void> {
  // The sale figure belongs to the claim that it sold. Any other answer
  // clears it, so a price can never outlive the judgement it was entered
  // for — the database CHECK would reject the pair anyway.
  const keepsSale = review === "renovated_use";

  const { error } = await db()
    .from("property_comps")
    .update({
      review,
      review_set_by: review === "needs_review" ? null : userId,
      review_set_at: review === "needs_review" ? null : new Date().toISOString(),
      sale_price: keepsSale ? sale.price : null,
      sale_date: keepsSale ? sale.date : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", compId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id);

  if (error) throw new Error(`Failed to save your review: ${error.message}`);
}

/** Tick or untick a comp. Dead: the ARV reads `review`. Kept for the old API. */
export async function setCompIncluded(
  compId: string,
  included: boolean,
  ctx: RequestContext
): Promise<void> {
  const { error } = await db()
    .from("property_comps")
    .update({ included, updated_at: new Date().toISOString() })
    .eq("id", compId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id);

  if (error) throw new Error(`Failed to update the comp: ${error.message}`);
}

export async function deleteComp(compId: string, ctx: RequestContext): Promise<void> {
  const { error } = await db()
    .from("property_comps")
    .delete()
    .eq("id", compId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id);

  if (error) throw new Error(`Failed to remove the comp: ${error.message}`);
}

/** The fact columns RentCast can fill. Typed, for the same reason as above. */
const SUBJECT_FACT_KEYS: (keyof Database["public"]["Tables"]["properties"]["Row"])[] = [
  "property_type",
  "beds",
  "baths",
  "sqft",
  "lot_sqft",
  "year_built",
  "last_sale_date",
  "last_sale_price",
] as const;

/**
 * Apply RentCast's subject facts, filling only the blanks.
 *
 * This previously gated on `facts_source !== 'manual'` and skipped the whole
 * update, which was wrong in a way live data exposed immediately: the column
 * DEFAULTS to 'manual', so every property that existed before the facts
 * migration — and every one created since by any path that does not set it —
 * was permanently ineligible. The Sylvan Rd property came back from RentCast
 * with a 1,750 sqft subject and kept `sqft = null`, which meant the ARV had no
 * size to multiply and could never compute. A property's facts simply never
 * filled in.
 *
 * Filling blanks is the rule that actually expresses the intent. A value a
 * person typed is non-null, so it is never overwritten; a column nobody has
 * filled gets the API's figure. That protects a hand-corrected sqft without
 * depending on a flag whose default disables the whole feature.
 */
export async function applySubjectFacts(
  propertyId: string,
  facts: MappedSubjectFacts,
  ctx: RequestContext
): Promise<void> {
  // The fixture subject would otherwise fill this house's blank columns and
  // stamp facts_source = 'rentcast' over data nobody got from RentCast.
  assertNotMockMode("RentCast subject facts");

  if (Object.keys(facts).length === 0) return;

  const { data: existing, error: readError } = await db()
    .from("properties")
    .select(SUBJECT_FACT_KEYS.join(","))
    .eq("id", propertyId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .maybeSingle();

  if (readError) throw new Error(`Failed to read the property: ${readError.message}`);
  if (!existing) throw new Error("Property not found.");

  const current = existing as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  for (const key of SUBJECT_FACT_KEYS) {
    const incoming = (facts as Record<string, unknown>)[key];
    // Only where RentCast has something and the column is empty.
    if (incoming !== undefined && (current[key] === null || current[key] === undefined)) {
      patch[key] = incoming;
    }
  }

  // Nothing to fill is a normal outcome, not a failure — it means the property
  // already knows everything RentCast could tell us.
  if (Object.keys(patch).length === 0) return;

  const { error } = await db()
    .from("properties")
    .update({
      ...patch,
      facts_source: "rentcast",
      facts_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", propertyId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id);

  if (error) throw new Error(`Failed to save the property facts: ${error.message}`);
}

// The usage log and the monthly counter moved to lib/rentcast/quota.ts, which
// owns the whole request lifecycle: claim, call, record, cache. Keeping a second
// pair of writers here would have meant two places deciding what counts as
// billable, and that disagreement is exactly what produced an undercount.
