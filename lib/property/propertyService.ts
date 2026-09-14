import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { RequestContext } from "../context";
import { addressHash } from "./address";
import {
  type Property,
  type PropertyInput,
  type PropertyOrigin,
  type UpsertPropertyResult,
} from "./types";

function db(): SupabaseClient {
  return createClient(
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
  const { data, error } = await client
    .from("properties")
    .insert({
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
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create property: ${error.message}`);
  return { property: data as Property, matchedOn: "created" };
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

  const { data, error } = await client
    .from("properties")
    .update(patch)
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update property: ${error.message}`);
  return data as Property;
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
