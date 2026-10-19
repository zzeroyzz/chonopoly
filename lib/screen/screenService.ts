import { createClient } from "@supabase/supabase-js";
import { type Database } from "../supabase/database.types";
import { type RequestContext } from "../context";
import { type Comp } from "../comps/types";
import { listComps } from "../comps/compService";
import { getPersonalProfile } from "../profile/buyerProfileService";
import { rehabEstimatesByProperty } from "../rehab/rehabService";
import { calculateRehab } from "../rehab/calculateRehab";
import { readInputs } from "../mortgage/scenarioService";
import { type HouseInputs } from "../mortgage/resolveInputs";
import { buildScreenRow, sortScreenRows, type ScreenHouse, type ScreenRow } from "./screenRow";

/**
 * Load everything the screen table needs, in a fixed number of queries.
 *
 * Four round trips total regardless of how many houses there are: the
 * properties, their analyses, their comps, and the profile. A query per house
 * would be an N+1 that gets slower exactly as the table gets more useful.
 */

function db() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type PropertyColumn = keyof Database["public"]["Tables"]["properties"]["Row"];

const PROPERTY_FIELDS: PropertyColumn[] = [
  "id",
  "address_line1",
  "city",
  "state",
  "zip",
  "sqft",
  "annual_taxes",
  "listing_url",
  "photo_url",
  "needs_address_review",
  "visit_completed_at",
  "created_at",
];

export async function loadScreenRows(
  ctx: RequestContext,
  /** The signed-in user. Their personal profile supplies income and debts. */
  userId: string
): Promise<ScreenRow[]> {
  const client = db();

  const { data: properties, error: propertyError } = await client
    .from("properties")
    .select(PROPERTY_FIELDS.join(","))
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .order("created_at", { ascending: false });

  if (propertyError) throw new Error(`Failed to load houses: ${propertyError.message}`);

  const rows = (properties ?? []) as unknown as {
    id: string;
    is_finalist?: boolean;
    address_line1: string;
    city: string | null;
    state: string | null;
    zip: string | null;
    sqft: number | null;
    annual_taxes: number | null;
    listing_url: string | null;
    photo_url: string | null;
    needs_address_review: boolean;
    visit_completed_at: string | null;
  }[];

  if (rows.length === 0) return [];

  const propertyIds = rows.map((r) => r.id);

  // Analyses for every house at once. `is_primary` picks the financing
  // scenario the other tabs mean; a rehab analysis of any kind ticks Estimate.
  const { data: analyses, error: analysisError } = await client
    .from("analyses")
    .select("id, property_id, kind, is_primary, label, inputs, inputs_version")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .in("property_id", propertyIds)
    .is("archived_at", null);

  if (analysisError) throw new Error(`Failed to load analyses: ${analysisError.message}`);

  const { data: entries, error: entryError } = await client
    .from("pipeline_entries")
    .select("id, property_id")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .in("property_id", propertyIds);

  if (entryError) throw new Error(`Failed to load pipeline entries: ${entryError.message}`);

  const [rawRehab, profile, compsByProperty] = await Promise.all([
    rehabEstimatesByProperty(propertyIds, ctx),
    // The user's own profile, not the property's context. Swallowing the error
    // here is what turned a team context into "Set your income" on every card.
    getPersonalProfile(userId),
    loadCompsByProperty(propertyIds, ctx),
  ]);

  // Totals need the contingency percentages, which live on the profile — so
  // they are built after it resolves rather than inside the batch above.
  const contingency = {
    photosPct: profile?.defaults.contingencyPhotosPct ?? 20,
    visitPct: profile?.defaults.contingencyVisitPct ?? 10,
  };
  const rehabTotals = new Map<string, { total: number; source: "photos" | "visit" }>();
  for (const [propertyId, estimate] of rawRehab) {
    const result = calculateRehab(estimate, contingency);
    rehabTotals.set(propertyId, { total: result.total, source: result.source });
  }

  const entryByProperty = new Map<string, string>();
  for (const entry of entries ?? []) {
    if (entry.property_id) entryByProperty.set(entry.property_id, entry.id);
  }

  interface AnalysisRow {
    property_id: string | null;
    kind: string;
    is_primary: boolean;
    label: string;
    inputs: unknown;
    inputs_version: number;
  }

  const primaryByProperty = new Map<string, AnalysisRow>();
  const rehabProperties = new Set<string>();

  for (const raw of analyses ?? []) {
    const analysis = raw as unknown as AnalysisRow;
    if (!analysis.property_id) continue;

    if (analysis.kind === "rehab") {
      rehabProperties.add(analysis.property_id);
      continue;
    }

    if (analysis.kind === "financing") {
      const existing = primaryByProperty.get(analysis.property_id);
      // The primary wins; otherwise the first financing analysis stands in, so
      // a house with numbers but no primary still shows them.
      if (!existing || (analysis.is_primary && !existing.is_primary)) {
        primaryByProperty.set(analysis.property_id, analysis);
      }
    }
  }

  const houses: ScreenHouse[] = rows.map((row) => {
    const primary = primaryByProperty.get(row.id);
    const comps = compsByProperty.get(row.id) ?? [];

    // Reviewed means someone has actually made a call on the comps: at least
    // one is excluded, or one was entered by hand. An untouched RentCast set
    // is unreviewed by definition.
    const compsReviewed =
      comps.length > 0 && comps.some((c) => !c.included || c.source === "manual");

    const analysisInputs: HouseInputs | null = primary
      ? (readInputs(primary.inputs, primary.inputs_version ?? 1) as HouseInputs)
      : null;

    return {
      propertyId: row.id,
      entryId: entryByProperty.get(row.id) ?? null,
      addressLine1: row.address_line1,
      city: row.city,
      state: row.state,
      zip: row.zip,
      sqft: row.sqft,
      annualTaxes: row.annual_taxes,
      listingUrl: row.listing_url,
      photoUrl: row.photo_url,
      needsAddressReview: row.needs_address_review,
      visitCompletedAt: row.visit_completed_at,
      isFinalist: row.is_finalist ?? false,
      analysisInputs,
      analysisLabel: primary?.label ?? null,
      hasRehabEstimate: rehabProperties.has(row.id),
      // The estimate itself, so the resolver returns it instead of the budget
      // and every card, verdict and profit figure picks it up at once.
      rehabEstimate: rehabTotals.get(row.id) ?? null,
      comps,
      compsReviewed,
    };
  });

  return sortScreenRows(houses.map((house) => buildScreenRow(house, { profile })));
}

/**
 * Comps for many houses, grouped.
 *
 * listComps is per-property, so calling it in a loop would be the N+1 this
 * module exists to avoid. One query, grouped in memory.
 */
async function loadCompsByProperty(
  propertyIds: string[],
  ctx: RequestContext
): Promise<Map<string, Comp[]>> {
  const grouped = new Map<string, Comp[]>();

  if (propertyIds.length === 1) {
    grouped.set(propertyIds[0], await listComps(propertyIds[0], ctx));
    return grouped;
  }

  const { data, error } = await db()
    .from("property_comps")
    .select("id, property_id, source, external_id, formatted_address, price, sqft, status, included, correlation")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .in("property_id", propertyIds);

  if (error) throw new Error(`Failed to load comps: ${error.message}`);

  for (const raw of data ?? []) {
    const row = raw as unknown as {
      id: string;
      property_id: string;
      source: string;
      external_id: string | null;
      formatted_address: string;
      price: number | null;
      sqft: number | null;
      status: string;
      included: boolean;
      correlation: number | null;
    };

    // Only the fields the ARV needs. The Comps tab loads the full rows when
    // someone opens one house; the table does not need a comp's lot size.
    const comp = {
      id: row.id,
      propertyId: row.property_id,
      source: row.source === "manual" ? "manual" : "rentcast",
      externalId: row.external_id,
      formattedAddress: row.formatted_address,
      city: null, state: null, zip: null, latitude: null, longitude: null,
      propertyType: null, beds: null, baths: null,
      sqft: row.sqft, lotSqft: null, yearBuilt: null,
      price: row.price === null ? null : Number(row.price),
      status: row.status, listingType: null, listedDate: null, removedDate: null,
      lastSeenDate: null, daysOnMarket: null, distanceMiles: null, daysOld: null,
      correlation: row.correlation === null ? null : Number(row.correlation),
      included: row.included, notes: null, updatedAt: "",
    } as unknown as Comp;

    const list = grouped.get(row.property_id);
    if (list) list.push(comp);
    else grouped.set(row.property_id, [comp]);
  }

  return grouped;
}
