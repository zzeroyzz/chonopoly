/**
 * Phase 0 of plans/fix-comps-accuracy.md: find out why the ARV is wrong,
 * without spending a single RentCast request.
 *
 * Every response we have ever paid for is already sitting in
 * `rentcast_requests.response_body`. This replays those stored bodies through
 * the real mapper and the real ARV code and prints, for every comp, whether it
 * counted and why not.
 *
 * READ-ONLY. Every query below is a `.select()`. Nothing here inserts, updates
 * or deletes, and nothing here calls RentCast — there is no API client import
 * in this file, on purpose.
 *
 * Run:
 *   node_modules/.bin/jiti scripts/diagnose-comps.ts
 *   node_modules/.bin/jiti scripts/diagnose-comps.ts "1653 Sylvan Rd SW"
 *   node_modules/.bin/jiti scripts/diagnose-comps.ts "1653 Sylvan Rd SW=389000"
 *   node_modules/.bin/jiti scripts/diagnose-comps.ts --sales "1653 Sylvan Rd SW"
 *
 * With no arguments it lists every house that has a stored response, so you can
 * pick the benchmarks. With arguments it diagnoses only those addresses; the
 * `=389000` suffix is the number you trust, printed beside the computed ARV.
 *
 * `--sales` replays the stored GET /properties body instead — the recorded
 * county sales — and prints the ARV they produce beside the listing one. Also
 * free: it reads the response already paid for.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Same .env.local reader as scripts/verify-webhooks.ts. Values are read into
// the process and never printed.
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // Falls through to the missing-credentials check below, which says what to do.
}

import { createClient } from "@supabase/supabase-js";
import {
  calculateArv,
  compEligibility,
  subjectOptions,
  COMP_ELIGIBILITY,
  type SubjectFit,
} from "../lib/comps/arv";
import { mapComparables } from "../lib/comps/fromRentCast";
import { normalizeAddress } from "../lib/property/address";
import { type Comp } from "../lib/comps/types";
import {
  type RentCastValueResponse,
  type RentCastPropertyRecord,
  VALUE_ESTIMATE_ENDPOINT,
  PROPERTY_RECORDS_ENDPOINT,
} from "../lib/rentcast/types";
import { mapPropertyRecords } from "../lib/comps/fromPropertyRecords";

interface PropertyRow {
  id: string;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  property_type: string | null;
  year_built: number | null;
  owner_type: string;
  owner_id: string;
}

interface RequestRow {
  id: string;
  normalized_address: string;
  requested_address: string | null;
  requested_at: string;
  billable: boolean | null;
  response_body: unknown;
}

/** The service-role client's concrete type, for passing it to a helper. */
function makeDb(url: string, key: string) {
  return createClient(url, key);
}
type Db = ReturnType<typeof makeDb>;

interface SalesRow {
  normalized_address: string | null;
  requested_address: string | null;
  requested_at: string;
  response_body: unknown;
}

/** A house to diagnose, with the number the owner trusts for it. */
interface Benchmark {
  query: string;
  trustedValue: number | null;
}

function parseArgs(argv: string[]): Benchmark[] {
  return argv.map((raw) => {
    const eq = raw.lastIndexOf("=");
    if (eq === -1) return { query: raw.trim(), trustedValue: null };
    const value = Number(raw.slice(eq + 1).replace(/[^0-9.]/g, ""));
    return {
      query: raw.slice(0, eq).trim(),
      trustedValue: Number.isFinite(value) && value > 0 ? value : null,
    };
  });
}

function money(n: number | null): string {
  return n === null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
}

function pad(value: string, width: number): string {
  return value.length > width ? value.slice(0, width - 1) + "…" : value.padEnd(width);
}

function padLeft(value: string, width: number): string {
  return value.length > width ? value.slice(0, width) : value.padStart(width);
}

/**
 * The stored response body, as comps in our shape.
 *
 * Goes through the same `mapComparables` the refresh route uses, so what this
 * prints is what the app would build — not a second opinion about it.
 *
 * `included` is set from the real `property_comps` rows where we have them,
 * matched on RentCast's comparable id. A comp the owner unticked must show as
 * unticked, or the diagnosis explains an ARV nobody is looking at.
 */
function compsFromResponse(
  response: RentCastValueResponse,
  includedByExternalId: Map<string, boolean>
): Comp[] {
  return mapComparables(response.comparables).map((mapped, index) => ({
    id: mapped.external_id ?? `stored-${index}`,
    propertyId: "",
    source: "rentcast" as const,
    externalId: mapped.external_id,
    formattedAddress: mapped.formatted_address,
    city: mapped.city,
    state: mapped.state,
    zip: mapped.zip,
    latitude: mapped.latitude,
    longitude: mapped.longitude,
    propertyType: mapped.property_type,
    beds: mapped.beds,
    baths: mapped.baths,
    sqft: mapped.sqft,
    lotSqft: mapped.lot_sqft,
    yearBuilt: mapped.year_built,
    price: mapped.price,
    status: mapped.status,
    listingType: mapped.listing_type,
    listedDate: mapped.listed_date,
    removedDate: mapped.removed_date,
    lastSeenDate: mapped.last_seen_date,
    daysOnMarket: mapped.days_on_market,
    distanceMiles: mapped.distance_miles,
    daysOld: mapped.days_old,
    correlation: mapped.correlation,
    // Default true: that is what a fresh save does, and it is the right
    // assumption for a comp we have never stored.
    buyerType: null,
    buyerName: null,
    county: null,
    included: mapped.external_id ? (includedByExternalId.get(mapped.external_id) ?? true) : true,
    // The replay approves everything: this tool exists to show what the comps
    // WOULD produce, not what the owner has decided about them.
    review: "renovated_use",
    reviewSetAt: null,
    notes: null,
    updatedAt: mapped.last_seen_date ?? "",
  }));
}

function describeSkip(
  comp: Comp,
  subjectSqft: number | null,
  subjectBeds: number | null,
  subjectFit: SubjectFit,
  decidedReasons: string[] | undefined,
  soldOnly: boolean
): string {
  if (!comp.included) return "unticked on the Comps tab";

  // The ARV's own verdict wins: a duplicate listing is only a duplicate next
  // to its twin, which the per-comp check cannot see on its own.
  if (decidedReasons) return decidedReasons.join(", ");

  const fit = compEligibility(comp, subjectSqft, subjectBeds, subjectFit);
  if (!fit.eligible) return fit.reasons.join(", ");

  if (comp.price === null || comp.price <= 0) return "no price";
  if (comp.sqft === null || comp.sqft <= 0) return "no size";

  if (soldOnly && comp.status !== "sold") {
    return "outranked — there are 2+ confirmed sales, so listings stop counting";
  }
  return "not used (reason unclear — check the ARV code)";
}

const COLUMNS = "  used  address                        status   price      sqft  bd  ba  type           built  dist   why not";

function diagnose(property: PropertyRow, request: RequestRow, trustedValue: number | null, includedByExternalId: Map<string, boolean>): void {
  const response = request.response_body as RentCastValueResponse;
  const comps = compsFromResponse(response, includedByExternalId);

  const subjectSqft = property.sqft;
  const subjectBeds = property.beds;
  const subjectFit: SubjectFit = {
    baths: property.baths,
    propertyType: property.property_type,
    yearBuilt: property.year_built,
  };

  const arv = calculateArv(comps, subjectSqft, subjectOptions(property));
  const usedIds = new Set(arv.usedComps.map((c) => c.compId));
  const decided = new Map(arv.excludedForFit.map((e) => [e.compId, e.reasons]));

  console.log("");
  console.log("─".repeat(140));
  console.log(
    `${property.address_line1}, ${property.city ?? "?"} ${property.state ?? "?"} ${property.zip ?? "?"}`
  );
  console.log(
    `  subject: ${subjectSqft ?? "no sqft"} sqft · ${subjectBeds ?? "?"} bd · ${property.baths ?? "?"} ba · ` +
      `${property.property_type ?? "type unknown"} · built ${property.year_built ?? "?"}`
  );
  console.log(
    `  response stored ${request.requested_at.slice(0, 10)}` +
      `${request.billable ? " (billed)" : " (not billed)"} · ${comps.length} comps in the body`
  );
  console.log("");
  console.log(COLUMNS);

  for (const comp of comps) {
    const used = usedIds.has(comp.id);
    const why = used
      ? ""
      : describeSkip(comp, subjectSqft, subjectBeds, subjectFit, decided.get(comp.id), arv.soldOnly);
    console.log(
      "  " +
        pad(used ? "YES " : "no  ", 6) +
        pad(comp.formattedAddress, 31) +
        pad(comp.status, 9) +
        padLeft(money(comp.price), 10) +
        padLeft(comp.sqft === null ? "—" : String(comp.sqft), 6) +
        padLeft(comp.beds === null ? "—" : String(comp.beds), 4) +
        padLeft(comp.baths === null ? "—" : String(comp.baths), 4) +
        "  " +
        pad(comp.propertyType ?? "—", 15) +
        padLeft(comp.yearBuilt === null ? "—" : String(comp.yearBuilt), 5) +
        padLeft(comp.distanceMiles === null ? "—" : comp.distanceMiles.toFixed(2), 7) +
        "   " +
        why
    );
  }

  console.log("");
  console.log(`  ARV now:    ${money(arv.value)}   (${arv.basisLabel}, confidence ${arv.confidence})`);
  console.log(`  your number:${padLeft(money(trustedValue), 12)}`);
  if (arv.value !== null && trustedValue !== null) {
    const diff = arv.value - trustedValue;
    const pct = (diff / trustedValue) * 100;
    console.log(`  off by:     ${money(Math.abs(diff))} ${diff >= 0 ? "high" : "low"} (${pct.toFixed(1)}%)`);
  }
  console.log(
    `  RentCast's own estimate: ${money(typeof response.price === "number" ? response.price : null)}`
  );
  for (const warning of arv.warnings) console.log(`  warning: ${warning}`);
}

/** Great-circle miles. Property rows do not store their own coordinates. */
function milesBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const EARTH_RADIUS_MILES = 3958.7613;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/**
 * Replay the stored GET /properties body as sold comps.
 *
 * The recorded sales never reach `property_comps` here — this maps them in
 * memory and runs the real `calculateArv`, so the number can be checked
 * before the migration that would let them be stored has been run.
 */
async function diagnoseRecordedSales(db: Db, query: string): Promise<void> {
  const normalizedQuery = normalizeAddress({ addressLine1: query });

  const { data: rows, error } = await db
    .from("rentcast_requests")
    .select("normalized_address, requested_address, requested_at, response_body")
    .eq("state", "succeeded")
    .eq("endpoint", PROPERTY_RECORDS_ENDPOINT)
    .not("response_body", "is", null)
    .order("requested_at", { ascending: false });

  if (error) {
    console.error(`Could not read the stored sales: ${error.message}`);
    process.exit(1);
  }

  const match = ((rows ?? []) as unknown as SalesRow[]).find(
    (r) =>
      r.normalized_address === normalizedQuery ||
      (r.normalized_address ?? "").startsWith(normalizedQuery)
  );

  if (!match) {
    console.log(`No stored /properties response for "${query}".`);
    return;
  }

  const records = match.response_body as unknown as RentCastPropertyRecord[];
  const sales = mapPropertyRecords(records);

  const { data: propertyRows } = await db
    .from("properties")
    .select("id, address_line1, city, state, zip, sqft, beds, baths, property_type, year_built");

  const property = ((propertyRows ?? []) as unknown as PropertyRow[]).find(
    (row) =>
      normalizeAddress({
        addressLine1: row.address_line1,
        city: row.city,
        state: row.state,
        zip: row.zip,
      }) === match.normalized_address
  );

  if (!property) {
    console.log(`A /properties response is stored for "${query}" but no house row matches it.`);
    return;
  }

  // The subject's coordinates come from the /avm/value body already paid for;
  // the properties table does not store them.
  const { data: avm } = await db
    .from("rentcast_requests")
    .select("response_body")
    .eq("state", "succeeded")
    .eq("endpoint", VALUE_ESTIMATE_ENDPOINT)
    .eq("normalized_address", match.normalized_address)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const avmBody = (avm as unknown as { response_body?: unknown } | null)?.response_body;
  const subjectPoint = (avmBody as RentCastValueResponse | undefined)?.subjectProperty;
  const subjectLat = subjectPoint?.latitude ?? null;
  const subjectLon = subjectPoint?.longitude ?? null;

  const comps: Comp[] = sales.map((sale, index) => ({
    id: sale.external_id ?? `sale-${index}`,
    propertyId: property.id,
    source: "manual",
    externalId: sale.external_id,
    formattedAddress: sale.formatted_address,
    city: sale.city,
    state: sale.state,
    zip: sale.zip,
    latitude: sale.latitude,
    longitude: sale.longitude,
    propertyType: sale.property_type,
    beds: sale.beds,
    baths: sale.baths,
    sqft: sale.sqft,
    lotSqft: sale.lot_sqft,
    yearBuilt: sale.year_built,
    price: sale.price,
    status: sale.status,
    listingType: null,
    listedDate: null,
    removedDate: sale.removed_date,
    lastSeenDate: sale.removed_date,
    daysOnMarket: null,
    distanceMiles:
      subjectLat !== null && subjectLon !== null && sale.latitude !== null && sale.longitude !== null
        ? milesBetween(subjectLat, subjectLon, sale.latitude, sale.longitude)
        : null,
    daysOld: null,
    correlation: null,
    buyerType: sale.buyer_type,
    buyerName: sale.buyer_name,
    county: sale.county,
    included: true,
    review: "renovated_use",
    reviewSetAt: null,
    notes: null,
    updatedAt: sale.removed_date ?? "",
  }));

  const arv = calculateArv(comps, property.sqft, subjectOptions(property));
  const usedIds = new Set(arv.usedComps.map((c) => c.compId));
  const noteFor = new Map(arv.compNotes.map((n) => [n.compId, n]));

  console.log("");
  console.log("─".repeat(140));
  console.log(
    `RECORDED SALES — ${property.address_line1}, ${property.city ?? "?"} ${property.state ?? "?"}`
  );
  console.log(
    `  subject: ${property.sqft ?? "no sqft"} sqft · ${property.beds ?? "?"} bd · ` +
      `${property.baths ?? "?"} ba · built ${property.year_built ?? "?"}`
  );
  console.log(
    `  stored ${match.requested_at.slice(0, 10)} · ${records.length} records · ${sales.length} with a sale price`
  );
  console.log("");
  console.log("  used  address                        sale price  sold on      sqft  bd  ba  built  dist   flag / why not");

  for (const comp of comps) {
    const note = noteFor.get(comp.id);
    const used = usedIds.has(comp.id);
    const flag = note?.fixerUpper ? `possible fixer-upper (${comp.buyerName ?? "?"})` : "";
    const why = used ? flag : (note?.reasons ?? []).join(", ");
    console.log(
      "  " +
        pad(used ? "YES " : "no  ", 6) +
        pad(comp.formattedAddress, 31) +
        padLeft(money(comp.price), 11) +
        padLeft(comp.removedDate ?? "—", 12) +
        padLeft(comp.sqft === null ? "—" : String(comp.sqft), 6) +
        padLeft(comp.beds === null ? "—" : String(comp.beds), 4) +
        padLeft(comp.baths === null ? "—" : String(comp.baths), 4) +
        padLeft(comp.yearBuilt === null ? "—" : String(comp.yearBuilt), 7) +
        padLeft(comp.distanceMiles === null ? "—" : comp.distanceMiles.toFixed(2), 7) +
        "   " +
        why
    );
  }

  console.log("");
  console.log(`  ARV from recorded sales: ${money(arv.value)}   (${arv.basisLabel}, ${arv.confidence})`);
  console.log(`  sold-only: ${arv.soldOnly}`);
  for (const warning of arv.warnings) console.log(`  warning: ${warning}`);
  if (arv.sanityWarning) console.log(`  sanity:  ${arv.sanityWarning}`);
}

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local and run again."
    );
    process.exit(1);
  }

  const db = makeDb(url, key);
  const argv = process.argv.slice(2);

  if (argv[0] === "--sales") {
    for (const query of argv.slice(1)) await diagnoseRecordedSales(db, query);
    console.log("");
    return;
  }

  const benchmarks = parseArgs(argv);

  const { data: requestRows, error: requestError } = await db
    .from("rentcast_requests")
    .select("id, normalized_address, requested_address, requested_at, billable, response_body")
    .eq("state", "succeeded")
    // Listings only. Without this the newest row for an address can be a
    // /properties body, which has no `comparables` at all and replays as
    // "0 comps" — the same endpoint-blind bug the 30-day cache had.
    .eq("endpoint", VALUE_ESTIMATE_ENDPOINT)
    .not("response_body", "is", null)
    .order("requested_at", { ascending: false });

  if (requestError) {
    console.error(`Could not read the stored RentCast responses: ${requestError.message}`);
    process.exit(1);
  }

  // Newest response per address, which is what the rebuild path would use.
  const latestByAddress = new Map<string, RequestRow>();
  for (const row of (requestRows ?? []) as RequestRow[]) {
    if (!latestByAddress.has(row.normalized_address)) latestByAddress.set(row.normalized_address, row);
  }

  if (latestByAddress.size === 0) {
    console.log("No stored RentCast responses found, so there is nothing to replay.");
    return;
  }

  const { data: propertyRows, error: propertyError } = await db
    .from("properties")
    .select(
      "id, address_line1, city, state, zip, sqft, beds, baths, property_type, year_built, owner_type, owner_id"
    );

  if (propertyError) {
    console.error(`Could not read the houses: ${propertyError.message}`);
    process.exit(1);
  }

  const propertyByAddress = new Map<string, PropertyRow>();
  for (const row of (propertyRows ?? []) as PropertyRow[]) {
    const normalized = normalizeAddress({
      addressLine1: row.address_line1,
      city: row.city,
      state: row.state,
      zip: row.zip,
    });
    if (!propertyByAddress.has(normalized)) propertyByAddress.set(normalized, row);
  }

  if (benchmarks.length === 0) {
    console.log("Houses with a stored RentCast response — pick your benchmarks from these.");
    console.log("Re-run with the address, and the number you trust after an '=':");
    console.log('  node_modules/.bin/jiti scripts/diagnose-comps.ts "1653 Sylvan Rd SW=389000"');
    console.log("");
    for (const [normalized, request] of latestByAddress) {
      const property = propertyByAddress.get(normalized);
      const comps = Array.isArray((request.response_body as RentCastValueResponse)?.comparables)
        ? (request.response_body as RentCastValueResponse).comparables!.length
        : 0;
      console.log(
        `  ${pad(request.requested_address ?? normalized, 48)} ` +
          `stored ${request.requested_at.slice(0, 10)}  ${padLeft(String(comps), 2)} comps  ` +
          `${property ? `${property.sqft ?? "no sqft"} sqft` : "no matching house row"}`
      );
    }
    console.log("");
    console.log(
      `Eligibility today: within ${COMP_ELIGIBILITY.maxDistanceMiles} mi, ` +
        `±${COMP_ELIGIBILITY.sqftTolerancePct}% size, ±${COMP_ELIGIBILITY.bedsTolerance} bedroom. ` +
        "No property type, baths or year-built check yet."
    );
    return;
  }

  for (const benchmark of benchmarks) {
    const normalizedQuery = normalizeAddress({ addressLine1: benchmark.query });
    const match = [...latestByAddress.entries()].find(
      ([normalized]) => normalized === normalizedQuery || normalized.startsWith(normalizedQuery)
    );

    if (!match) {
      console.log("");
      console.log(`No stored response for "${benchmark.query}".`);
      console.log("Run with no arguments to see the addresses that do have one.");
      continue;
    }

    const [normalized, request] = match;
    const property = propertyByAddress.get(normalized);
    if (!property) {
      console.log("");
      console.log(`A response is stored for "${benchmark.query}" but no house row matches it.`);
      continue;
    }

    const { data: compRows, error: compError } = await db
      .from("property_comps")
      .select("external_id, included")
      .eq("property_id", property.id);

    if (compError) {
      console.error(`Could not read the saved comps: ${compError.message}`);
      process.exit(1);
    }

    const includedByExternalId = new Map<string, boolean>();
    for (const row of compRows ?? []) {
      if (row.external_id) includedByExternalId.set(row.external_id as string, row.included as boolean);
    }

    diagnose(property, request, benchmark.trustedValue, includedByExternalId);
  }

  console.log("");
}

run().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "The diagnosis failed.");
  process.exit(1);
});
