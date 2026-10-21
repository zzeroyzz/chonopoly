/**
 * Put every existing comp back to "Needs review", and show what that does to
 * each house's ARV.
 *
 * The migration's DEFAULT already lands every existing row on 'needs_review',
 * so in the normal case this has nothing to write and says so. It exists for
 * the case where something has been reviewed and the whole set needs starting
 * again, and as the check that the migration did what it claimed.
 *
 * DRY RUN BY DEFAULT. Pass --write to apply.
 *
 *   node_modules/.bin/jiti scripts/review-reset.ts
 *   node_modules/.bin/jiti scripts/review-reset.ts --write
 *
 * No RentCast calls: there is no API client import in this file.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
} catch {
  // Falls through to the credentials check below.
}

import { createClient } from "@supabase/supabase-js";
import { calculateArv, subjectOptions } from "../lib/comps/arv";
import { type Comp, type CompReview, type CompSource, type CompStatus } from "../lib/comps/types";

interface PropertyRow {
  id: string;
  address_line1: string;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  property_type: string | null;
  year_built: number | null;
}

const money = (n: number | null) => (n === null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);

function toComp(row: Record<string, unknown>): Comp {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: row.id as string,
    propertyId: row.property_id as string,
    source: row.source as CompSource,
    externalId: (row.external_id as string) ?? null,
    formattedAddress: row.formatted_address as string,
    city: null,
    state: null,
    zip: null,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    propertyType: (row.property_type as string) ?? null,
    beds: num(row.beds),
    baths: num(row.baths),
    sqft: num(row.sqft),
    lotSqft: num(row.lot_sqft),
    yearBuilt: num(row.year_built),
    price: num(row.price),
    status: row.status as CompStatus,
    listingType: null,
    listedDate: (row.listed_date as string) ?? null,
    removedDate: (row.removed_date as string) ?? null,
    lastSeenDate: (row.last_seen_date as string) ?? null,
    daysOnMarket: num(row.days_on_market),
    distanceMiles: num(row.distance_miles),
    daysOld: num(row.days_old),
    correlation: num(row.correlation),
    review: row.review as CompReview,
    reviewSetAt: (row.review_set_at as string) ?? null,
    salePrice: num(row.sale_price),
    saleDate: (row.sale_date as string) ?? null,
    buyerType: (row.buyer_type as string) ?? null,
    buyerName: (row.buyer_name as string) ?? null,
    county: (row.county as string) ?? null,
    included: row.included as boolean,
    notes: null,
    updatedAt: (row.updated_at as string) ?? "",
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase credentials in .env.local.");
    process.exit(1);
  }

  const write = process.argv.includes("--write");
  const db = createClient(url, key);

  const { data: propertyRows, error } = await db
    .from("properties")
    .select("id, address_line1, sqft, beds, baths, property_type, year_built");
  if (error) {
    console.error(`Could not read the houses: ${error.message}`);
    process.exit(1);
  }

  console.log(write ? "APPLYING — this writes to the database." : "DRY RUN — nothing is written.");
  console.log("=".repeat(96));

  let toReset = 0;

  for (const property of (propertyRows ?? []) as unknown as PropertyRow[]) {
    const { data: compRows } = await db
      .from("property_comps")
      .select("*")
      .eq("property_id", property.id);

    const comps = ((compRows ?? []) as Record<string, unknown>[]).map(toComp);
    if (comps.length === 0) continue;

    const before = calculateArv(comps, property.sqft, subjectOptions(property));
    const after = calculateArv(
      comps.map((c) => ({ ...c, review: "needs_review" as const })),
      property.sqft,
      subjectOptions(property)
    );

    const notYetReset = comps.filter((c) => c.review !== "needs_review").length;
    toReset += notYetReset;

    console.log("");
    console.log(`${property.address_line1}  (${comps.length} comps)`);
    console.log(`  already needs_review: ${comps.length - notYetReset} of ${comps.length}`);
    console.log(`  to reset:             ${notYetReset}`);
    console.log(`  ARV before: ${before.value === null ? before.reviewPrompt ?? "—" : money(before.value)}`);
    console.log(`  ARV after:  ${after.value === null ? after.reviewPrompt ?? "—" : money(after.value)}`);
  }

  console.log("");
  console.log("=".repeat(96));
  console.log(`${toReset} comps would change state.`);

  if (!write) {
    console.log("\nDry run. Re-run with --write to apply.");
    return;
  }

  if (toReset === 0) {
    console.log("\nNothing to write.");
    return;
  }

  const { error: writeError } = await db
    .from("property_comps")
    .update({ review: "needs_review", review_set_by: null, review_set_at: null })
    .neq("review", "needs_review");

  if (writeError) {
    console.error(`Failed to reset: ${writeError.message}`);
    process.exit(1);
  }
  console.log(`\nReset ${toReset} comps to Needs review.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "failed");
  process.exit(1);
});
