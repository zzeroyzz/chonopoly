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
 *
 * With no arguments it lists every house that has a stored response, so you can
 * pick the benchmarks. With arguments it diagnoses only those addresses; the
 * `=389000` suffix is the number you trust, printed beside the computed ARV.
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
import { calculateArv, compEligibility, COMP_ELIGIBILITY } from "../lib/comps/arv";
import { mapComparables } from "../lib/comps/fromRentCast";
import { normalizeAddress } from "../lib/property/address";
import { type Comp } from "../lib/comps/types";
import { type RentCastValueResponse } from "../lib/rentcast/types";

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
    included: mapped.external_id ? (includedByExternalId.get(mapped.external_id) ?? true) : true,
    notes: null,
    updatedAt: mapped.last_seen_date ?? "",
  }));
}

function describeSkip(
  comp: Comp,
  subjectSqft: number | null,
  subjectBeds: number | null,
  soldOnly: boolean
): string {
  if (!comp.included) return "unticked on the Comps tab";

  const fit = compEligibility(comp, subjectSqft, subjectBeds);
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

  const arv = calculateArv(comps, subjectSqft, { subjectBeds });
  const usedIds = new Set(arv.usedComps.map((c) => c.compId));

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
    const why = used ? "" : describeSkip(comp, subjectSqft, subjectBeds, arv.soldOnly);
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

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local and run again."
    );
    process.exit(1);
  }

  const db = createClient(url, key);
  const benchmarks = parseArgs(process.argv.slice(2));

  const { data: requestRows, error: requestError } = await db
    .from("rentcast_requests")
    .select("id, normalized_address, requested_address, requested_at, billable, response_body")
    .eq("state", "succeeded")
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
