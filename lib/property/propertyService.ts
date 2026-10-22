import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "../supabase/database.types";

type PropertyInsert = Database["public"]["Tables"]["properties"]["Insert"];
import { RequestContext } from "../context";
import { addressHash } from "./address";
import {
  type Property,
  type PropertyInput,
  type PropertyOrigin,
  type UpsertPropertyResult,
} from "./types";

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

/** Only overwrite an existing column when the incoming value actually says something. */
function mergeDefined<T extends object>(existing: T, incoming: Partial<T>): Partial<T> {
  const patch: Partial<T> = {};
  for (const [key, value] of Object.entries(incoming) as [keyof T, T[keyof T]][]) {
    if (value === undefined || value === null || value === "") continue;
    patch[key] = value;
  }
  return patch;
}

/**
 * Find-or-create a property, deduping on parcel number first and normalized
 * address second.
 *
 * Every write path goes through here — the Cash Flow analysis save, the CRM
 * manual create, the PropStream import, and the public seller form — so the
 * dedupe rule exists in exactly one place.
 *
 * A parcel match is authoritative. An address match is a *probable* match:
 * normalization is lossy, so the row is reused but flagged with
 * `needs_address_review` for a human to confirm or split. A false merge is
 * worse than a duplicate, which is why address_hash carries no unique
 * constraint in the schema.
 */

/** Postgres: column does not exist. */
const UNDEFINED_COLUMN = "42703";

function mentionsMissingColumn(message: string, column: string): boolean {
  return message.includes(UNDEFINED_COLUMN) || message.includes(column);
}

/**
 * Write a row, dropping a column the database has not got yet.
 *
 * `list_price` once shipped ahead of its migration, and a house that will not
 * save is a worse failure than a price that is not stored yet. The retry is
 * narrow on purpose: one named column, one retry.
 *
 * That migration has since been applied (confirmed 2026-10-21: `list_price`
 * is in the generated types and reads back on the house page), so this no
 * longer fires in practice. Kept because an environment restored from an
 * older schema should still be able to save a house; removing it is a
 * separate decision, not a tidy-up.
 */
interface WriteOutcome {
  data: unknown;
  error: { message: string } | null;
}

async function writeTolerating<T>(
  column: string,
  attempt: (withColumn: boolean) => PromiseLike<WriteOutcome>
): Promise<T> {
  const first = await attempt(true);
  if (!first.error) return first.data as T;
  if (!mentionsMissingColumn(first.error.message, column)) {
    throw new Error(first.error.message);
  }
  const second = await attempt(false);
  if (second.error) throw new Error(second.error.message);
  return second.data as T;
}

export async function upsertProperty(
  input: PropertyInput,
  ctx: RequestContext,
  userId: string,
  origin: PropertyOrigin = "manual"
): Promise<UpsertPropertyResult> {
  const client = db();

  const hash = addressHash({
    addressLine1: input.address_line1,
    city: input.city,
    state: input.state,
    zip: input.zip,
  });

  const scoped = () =>
    client.from("properties").select("*").eq("owner_type", ctx.type).eq("owner_id", ctx.id);

  // 1. Parcel number is the real key.
  if (input.parcel_number) {
    const { data: byParcel } = await scoped().eq("parcel_number", input.parcel_number).maybeSingle();
    if (byParcel) {
      const updated = await applyPatch(client, byParcel as Property, input, hash, false);
      return { property: updated, matchedOn: "parcel" };
    }
  }

  // 2. Fall back to the normalized address, and flag it.
  const { data: byHash } = await scoped().eq("address_hash", hash).maybeSingle();
  if (byHash) {
    const updated = await applyPatch(client, byHash as Property, input, hash, true);
    return { property: updated, matchedOn: "address" };
  }

  // 3. New property.
  // The row is assembled and cast once here rather than widening the table's
  // typing everywhere.
  //
  // This was because `list_price` was not in the generated types. It is now
  // (confirmed 2026-10-21), so the cast is no longer load-bearing and can go
  // with the tolerating write above. Left together, as one decision.
  const insertRow = (withPrice: boolean) =>
    ({
      owner_type: ctx.type,
      owner_id: ctx.id,
      address_line1: input.address_line1,
      city: input.city ?? null,
      county: input.county ?? null,
      state: input.state ?? "GA",
      zip: input.zip ?? null,
      parcel_number: input.parcel_number ?? null,
      address_hash: hash,
      needs_address_review: false,
      origin,
      property_type: input.property_type ?? "single_family",
      beds: input.beds ?? null,
      baths: input.baths ?? null,
      sqft: input.sqft ?? null,
      lot_sqft: input.lot_sqft ?? null,
      year_built: input.year_built ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      description: input.description ?? null,
      photo_url: input.photo_url ?? null,
      listing_url: input.listing_url ?? null,
      created_by: userId,
      ...(withPrice && input.list_price !== undefined
        ? { list_price: input.list_price }
        : {}),
    }) as unknown as PropertyInsert;

  const created = await writeTolerating<Property>("list_price", (withPrice) =>
    client.from("properties").insert(insertRow(withPrice)).select("*").single()
  );

  return { property: created, matchedOn: "created" };
}

async function applyPatch(
  client: SupabaseClient,
  existing: Property,
  input: PropertyInput,
  hash: string,
  flagForReview: boolean
): Promise<Property> {
  const patch = mergeDefined(existing, {
    ...input,
    address_hash: hash,
  } as Partial<Property>);

  if (flagForReview) patch.needs_address_review = true;

  if (Object.keys(patch).length === 0) return existing;

  return writeTolerating<Property>("list_price", (withPrice) => {
    const body: Record<string, unknown> = { ...patch };
    if (!withPrice) delete body.list_price;
    return client
      .from("properties")
      .update(body as never)
      .eq("id", existing.id)
      .select("*")
      .single();
  });
}

export async function listProperties(ctx: RequestContext): Promise<Property[]> {
  const { data, error } = await db()
    .from("properties")
    .select("*")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to list properties: ${error.message}`);
  return (data ?? []) as Property[];
}

export async function getProperty(id: string, ctx: RequestContext): Promise<Property | null> {
  const { data } = await db()
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .maybeSingle();

  return (data as Property) ?? null;
}

/**
 * Mark a house as one of the finalists, or unmark it.
 *
 * Throws a readable error when the column is missing rather than a Postgres
 * one, because until the migration runs that is the expected answer and the
 * UI says so instead of showing a failed request.
 */
export async function setFinalist(
  id: string,
  isFinalist: boolean,
  ctx: RequestContext
): Promise<boolean> {
  const { error } = await db()
    .from("properties")
    .update({ is_finalist: isFinalist })
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id);

  if (error) {
    if (/is_finalist/.test(error.message)) {
      throw new Error("Finalists need the finalists migration to be run first");
    }
    throw new Error(error.message);
  }
  return isFinalist;
}

/** Clear the review flag after a human confirms the fuzzy match was correct. */
export async function confirmAddressMatch(id: string, ctx: RequestContext): Promise<void> {
  const { error } = await db()
    .from("properties")
    .update({ needs_address_review: false })
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id);

  if (error) throw new Error(`Failed to confirm address match: ${error.message}`);
}

export interface PropertyFactsPatch {
  addressLine1?: string;
  city?: string | null;
  /** NOT NULL in the schema with a 'GA' default, so it cannot be cleared. */
  state?: string;
  zip?: string | null;
  propertyType?: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lotSqft?: number | null;
  yearBuilt?: number | null;
  annualTaxes?: number | null;
  /** What the house is on the market for. Correctable, like sqft. */
  listPrice?: number | null;
  listingUrl?: string | null;
  /**
   * A link to a photo of the house. Null clears it, which is how a wrong
   * paste gets undone.
   *
   * Hand-set, so it rides `facts_source = 'manual'` below and a later
   * RentCast refresh will not replace a photo someone chose.
   */
  photoUrl?: string | null;
}

/**
 * Edit a house by hand.
 *
 * Sets `facts_source = 'manual'`, which is the point: a figure someone typed
 * after standing in the house outranks RentCast's, and `applySubjectFacts`
 * only ever fills blanks, so a corrected value is never overwritten by a later
 * refresh.
 *
 * Changing the address re-derives `address_hash`, so the house keeps deduping
 * against the right thing — and clears `needs_address_review`, because a human
 * typing the address IS the review that flag was asking for.
 */
export async function updatePropertyFacts(
  id: string,
  patch: PropertyFactsPatch,
  ctx: RequestContext
): Promise<Property> {
  const existing = await getProperty(id, ctx);
  if (!existing) throw new Error("Property not found");

  // The generated Update type, so a mistyped column fails to compile.
  type PropertyUpdate = Database["public"]["Tables"]["properties"]["Update"];
  const update: PropertyUpdate = { updated_at: new Date().toISOString() };

  const addressChanged =
    patch.addressLine1 !== undefined ||
    patch.city !== undefined ||
    patch.state !== undefined ||
    patch.zip !== undefined;

  if (patch.addressLine1 !== undefined) {
    const line = patch.addressLine1.trim();
    if (!line) throw new Error("A house needs an address");
    update.address_line1 = line;
  }
  if (patch.city !== undefined) update.city = patch.city;
  if (patch.state !== undefined) update.state = patch.state;
  if (patch.zip !== undefined) update.zip = patch.zip;

  if (addressChanged) {
    update.address_hash = addressHash({
      addressLine1: (update.address_line1 as string) ?? existing.address_line1,
      city: (patch.city !== undefined ? patch.city : existing.city) ?? null,
      state: (patch.state !== undefined ? patch.state : existing.state) ?? null,
      zip: (patch.zip !== undefined ? patch.zip : existing.zip) ?? null,
    });
    // Typing the address by hand is the review the flag was asking for.
    update.needs_address_review = false;
  }

  // Facts. Only the keys actually sent, so an omitted field is left alone
  // rather than nulled.
  const factKeys: [keyof PropertyFactsPatch, keyof PropertyUpdate][] = [
    ["propertyType", "property_type"],
    ["beds", "beds"],
    ["baths", "baths"],
    ["sqft", "sqft"],
    ["lotSqft", "lot_sqft"],
    ["yearBuilt", "year_built"],
    ["annualTaxes", "annual_taxes"],
    ["listingUrl", "listing_url"],
    ["photoUrl", "photo_url"],
  ];

  let touchedFacts = false;
  for (const [key, column] of factKeys) {
    const value = patch[key];
    if (value !== undefined) {
      Object.assign(update, { [column]: value });
      touchedFacts = true;
    }
  }

  // Assigned past the typed loop above, the same accommodation upsertProperty
  // makes, and for the reason that no longer applies: `list_price` is in the
  // generated types as of 2026-10-21. Deliberately NOT wrapped in
  // writeTolerating — a price edit that silently does not save is the exact
  // bug this column was added to fix, so a missing column should say so.
  if (patch.listPrice !== undefined) {
    Object.assign(update, { list_price: patch.listPrice });
    touchedFacts = true;
  }

  if (touchedFacts) {
    update.facts_source = "manual";
    update.facts_updated_at = new Date().toISOString();
  }

  const { data, error } = await db()
    .from("properties")
    .update(update)
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update the house: ${error.message}`);
  return data as unknown as Property;
}
