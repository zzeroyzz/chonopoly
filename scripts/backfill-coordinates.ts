/**
 * Put the houses that already exist on the Properties map.
 *
 * New houses are geocoded as they are saved. Houses saved before that have
 * no `latitude` / `longitude`, so this looks each one up once through the
 * free Census geocoder and stores the point. It writes those two columns and
 * nothing else, and only on rows where both are still empty.
 *
 * DRY RUN BY DEFAULT: it lists every house it would place, and where. Pass
 * --write to apply. Writes to the live database, so it runs only on the
 * owner's word ("run the backfill").
 *
 *   node_modules/.bin/jiti scripts/backfill-coordinates.ts
 *   node_modules/.bin/jiti scripts/backfill-coordinates.ts --write
 *
 * No RentCast calls: the Census geocoder is the only outside service here.
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
import { geocodeAddress, oneLineAddress } from "../lib/census/geocode";

interface UnplacedRow {
  id: string;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/** One lookup at a time, with a pause between, so a free service is not hammered. */
const PAUSE_MS = 250;

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    process.exit(1);
  }

  const write = process.argv.includes("--write");
  const db = createClient(url, key);

  const { data, error } = await db
    .from("properties")
    .select("id, address_line1, city, state, zip")
    .is("latitude", null)
    .is("longitude", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`Could not read the houses: ${error.message}`);
    process.exit(1);
  }

  const rows = (data ?? []) as UnplacedRow[];
  if (rows.length === 0) {
    console.log("Every house already has a place on the map. Nothing to do.");
    return;
  }

  console.log(`${rows.length} house(s) without a place on the map.\n`);

  let placed = 0;
  let unmatched = 0;
  let failedWrites = 0;

  for (const row of rows) {
    const address = {
      addressLine1: row.address_line1,
      city: row.city,
      state: row.state,
      zip: row.zip,
    };
    const point = await geocodeAddress(address);
    const line = oneLineAddress(address);

    if (!point) {
      unmatched += 1;
      console.log(`  ✗ ${row.id}  ${line}  — no match, left as it is`);
    } else if (!write) {
      placed += 1;
      console.log(`  → ${row.id}  ${line}  — would place at ${point.latitude}, ${point.longitude}`);
    } else {
      // The empty-check again on the write, so a house placed since the read
      // (a save from the app, say) is not overwritten.
      const { error: updateError } = await db
        .from("properties")
        .update({ latitude: point.latitude, longitude: point.longitude })
        .eq("id", row.id)
        .is("latitude", null)
        .is("longitude", null);

      if (updateError) {
        failedWrites += 1;
        console.log(`  ! ${row.id}  ${line}  — not saved: ${updateError.message}`);
      } else {
        placed += 1;
        console.log(`  ✓ ${row.id}  ${line}  — placed at ${point.latitude}, ${point.longitude}`);
      }
    }

    await pause(PAUSE_MS);
  }

  console.log(
    `\n${write ? "Placed" : "Would place"} ${placed}. No match for ${unmatched}.` +
      (failedWrites > 0 ? ` ${failedWrites} failed to save.` : "")
  );
  if (!write) console.log("\nDry run. Re-run with --write to apply.");
  if (failedWrites > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
