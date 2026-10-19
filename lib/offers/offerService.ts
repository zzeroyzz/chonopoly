import { createClient } from "@supabase/supabase-js";
import { type Database } from "../supabase/database.types";
import { type RequestContext } from "../context";
import { getProperty } from "../property/propertyService";
import { logActivity } from "../crm/detailService";

/**
 * Offers on a house, kept as history.
 *
 * What you first offered, what they countered and what was accepted are three
 * different numbers, and a deal gets argued about using all three — so each is
 * a row rather than one figure that gets overwritten.
 *
 * Making an offer deliberately does NOT move the pipeline stage. The stage is
 * the owner's to change; an offer that gets rejected should not have dragged
 * the house forward and then back again.
 */

function db() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Untyped, and only for `offers`.
 *
 * Everything else here uses the generated schema so a mistyped column is a
 * compile error. `offers` cannot be in that schema yet: the table arrives with
 * a migration that has not run, and `npm run db:types` reads the live
 * database. Narrowed to this one table and this one reason.
 *
 * TODO once the migration is applied: run `npm run db:types` and switch these
 * calls back to the typed client, which will then check the columns.
 */
function offersDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const TABLE = "offers";

export const OFFER_STATUSES = [
  "drafted",
  "submitted",
  "countered",
  "accepted",
  "rejected",
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  drafted: "Drafted",
  submitted: "Submitted",
  countered: "Countered",
  accepted: "Accepted",
  rejected: "Rejected",
};

export interface Offer {
  id: string;
  propertyId: string;
  amount: number;
  offeredOn: string;
  status: OfferStatus;
  note: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  property_id: string;
  amount: number | string;
  offered_on: string;
  status: string;
  note: string | null;
  created_at: string;
}

function toOffer(row: Row): Offer {
  return {
    id: row.id,
    propertyId: row.property_id,
    amount: Number(row.amount),
    offeredOn: row.offered_on,
    status: (OFFER_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as OfferStatus)
      : "drafted",
    note: row.note,
    createdAt: row.created_at,
  };
}

/** Missing table means the migration has not run, which is not an error. */
function tableMissing(message: string): boolean {
  return /relation .*offers.* does not exist|could not find the table/i.test(message);
}

export async function listOffers(
  propertyId: string,
  ctx: RequestContext
): Promise<{ offers: Offer[]; available: boolean }> {
  const { data, error } = await offersDb()
    .from(TABLE)
    .select("id, property_id, amount, offered_on, status, note, created_at")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("property_id", propertyId)
    .order("offered_on", { ascending: false });

  if (error) {
    // Degrades to "no offers yet" rather than taking the property page down.
    if (tableMissing(error.message)) return { offers: [], available: false };
    throw new Error(error.message);
  }

  return { offers: ((data ?? []) as unknown as Row[]).map(toOffer), available: true };
}

export interface SaveOfferInput {
  amount: number;
  offeredOn?: string;
  status?: OfferStatus;
  note?: string | null;
}

export async function saveOffer(
  propertyId: string,
  input: SaveOfferInput,
  ctx: RequestContext,
  userId: string
): Promise<Offer> {
  const property = await getProperty(propertyId, ctx);
  if (!property) throw new Error("Property not found");

  const { data, error } = await offersDb()
    .from(TABLE)
    .insert({
      owner_type: ctx.type,
      owner_id: ctx.id,
      property_id: propertyId,
      amount: Math.max(0, input.amount),
      offered_on: input.offeredOn ?? new Date().toISOString().slice(0, 10),
      status: input.status ?? "drafted",
      note: input.note ?? null,
      created_by: userId,
    })
    .select("id, property_id, amount, offered_on, status, note, created_at")
    .single();

  if (error) {
    if (tableMissing(error.message)) {
      throw new Error("Offers need the offers migration to be run first");
    }
    throw new Error(error.message);
  }

  const offer = toOffer(data as unknown as Row);

  // Every offer shows up in the house's history. The stage stays where it is.
  const { data: entry } = await db()
    .from("pipeline_entries")
    .select("id")
    .eq("property_id", propertyId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .maybeSingle();

  if (entry) {
    try {
      const amount = `$${Math.round(offer.amount).toLocaleString()}`;
      await logActivity(
        {
          pipeline_entry_id: entry.id,
          type: "note",
          direction: "na",
          body: `Offer ${OFFER_STATUS_LABEL[offer.status].toLowerCase()}: ${amount}${
            offer.note ? ` — ${offer.note}` : ""
          }`,
        },
        ctx,
        userId
      );
    } catch (e) {
      // The offer is saved either way; a missing history line is not worth
      // losing it over.
      console.error("Failed to log the offer activity:", e instanceof Error ? e.message : e);
    }
  }

  return offer;
}
