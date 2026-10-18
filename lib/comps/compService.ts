import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { type RequestContext } from "../context";
import { type Comp, type CompStatus, type ManualCompInput } from "./types";
import { type MappedComp, type MappedSubjectFacts } from "./fromRentCast";

/**
 * Reading and writing comps, and the RentCast usage log.
 *
 * Service-role client, same as propertyService: every call has already resolved
 * a context, and the owner filter is applied explicitly on every query rather
 * than left to RLS. Both layers agree, which means a bug in either one is
 * caught by the other.
 */

function db(): SupabaseClient {
  return createClient(
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
  included: boolean;
  notes: string | null;
  updated_at: string;
}

const COMP_COLUMNS =
  "id,property_id,source,external_id,formatted_address,city,state,zip,latitude,longitude," +
  "property_type,beds,baths,sqft,lot_sqft,year_built,price,status,listing_type,listed_date," +
  "removed_date,last_seen_date,days_on_market,distance_miles,days_old,correlation,included," +
  "notes,updated_at";

function toComp(row: CompRow): Comp {
  return {
    id: row.id,
    propertyId: row.property_id,
    source: row.source === "manual" ? "manual" : "rentcast",
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
 * Upsert on `(property_id, source, external_id)`, which the partial unique
 * index backs, so refreshing updates the comps already held rather than
 * appending a second copy of each. The `included` flag is deliberately NOT part
 * of the update: a refresh must not silently re-tick a comp the user excluded
 * on purpose, which is the kind of change that moves an ARV with no visible
 * cause.
 */
export async function saveRentCastComps(
  propertyId: string,
  comps: MappedComp[],
  ctx: RequestContext,
  userId: string
): Promise<Comp[]> {
  if (comps.length === 0) return listComps(propertyId, ctx);

  const rows = comps.map((comp) => ({
    ...comp,
    property_id: propertyId,
    owner_type: ctx.type,
    owner_id: ctx.id,
    source: "rentcast" as const,
    created_by: userId,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await db()
    .from("property_comps")
    .upsert(rows, { onConflict: "property_id,source,external_id", ignoreDuplicates: false });

  if (error) throw new Error(`Failed to save comps: ${error.message}`);
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
      created_by: userId,
    })
    .select(COMP_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to add the comp: ${error.message}`);
  return toComp(data as unknown as CompRow);
}

/** Tick or untick a comp. The only field the Comps tab edits in place. */
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

/**
 * Apply RentCast's subject facts without trampling anything a person typed.
 *
 * `facts_source = 'manual'` wins: someone who corrected a sqft after standing
 * in the house knows more than the API does, and a refresh that quietly reverts
 * it is worse than one that does nothing.
 */
export async function applySubjectFacts(
  propertyId: string,
  facts: MappedSubjectFacts,
  ctx: RequestContext
): Promise<void> {
  if (Object.keys(facts).length === 0) return;

  const { data: existing, error: readError } = await db()
    .from("properties")
    .select("facts_source")
    .eq("id", propertyId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .maybeSingle();

  if (readError) throw new Error(`Failed to read the property: ${readError.message}`);
  if (!existing) throw new Error("Property not found.");
  if (existing.facts_source === "manual") return;

  const { error } = await db()
    .from("properties")
    .update({
      ...facts,
      facts_source: "rentcast",
      facts_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", propertyId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id);

  if (error) throw new Error(`Failed to save the property facts: ${error.message}`);
}

// ─── Usage log ────────────────────────────────────────────────────────────────

export interface LogRequestInput {
  propertyId: string | null;
  endpoint: string;
  statusCode: number | null;
  succeeded: boolean;
  billable: boolean;
  error: string | null;
}

/**
 * Log a RentCast call.
 *
 * Never throws. A lookup that worked must not be reported as a failure because
 * the audit row would not insert — the user came here for comps, not for
 * bookkeeping. A logging failure is surfaced on the server and nowhere else.
 */
export async function logRentCastRequest(
  input: LogRequestInput,
  ctx: RequestContext
): Promise<void> {
  try {
    const { error } = await db().from("rentcast_requests").insert({
      owner_type: ctx.type,
      owner_id: ctx.id,
      property_id: input.propertyId,
      endpoint: input.endpoint,
      status_code: input.statusCode,
      succeeded: input.succeeded,
      billable: input.billable,
      error: input.error,
    });
    if (error) console.error("Failed to log a RentCast request:", error.message);
  } catch (e) {
    console.error("Failed to log a RentCast request:", e);
  }
}

export interface UsageThisMonth {
  used: number;
  limit: number;
  /** 0–1. Drives the 80% warning. */
  fraction: number;
  monthStart: string;
}

/**
 * Billable requests this calendar month.
 *
 * Calendar month, which is an assumption worth naming: RentCast bills on the
 * subscription period, so a mid-month signup makes this an approximation until
 * the two line up. It is the honest direction to be wrong in — the counter can
 * read low near a boundary, never high.
 */
export async function getUsageThisMonth(
  ctx: RequestContext,
  limit: number,
  now: Date = new Date()
): Promise<UsageThisMonth> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const { count, error } = await db()
    .from("rentcast_requests")
    .select("id", { count: "exact", head: true })
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("billable", true)
    .gte("requested_at", monthStart.toISOString());

  if (error) throw new Error(`Failed to read RentCast usage: ${error.message}`);

  const used = count ?? 0;
  return {
    used,
    limit,
    fraction: limit > 0 ? used / limit : 0,
    monthStart: monthStart.toISOString(),
  };
}
