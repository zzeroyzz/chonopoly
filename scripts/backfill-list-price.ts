/**
 * Give each house without a listing price the price already in its numbers.
 *
 * Houses saved through the calculator, or pasted in a batch, carry their price
 * only inside their financing numbers (`analyses.inputs.homeValue`), which is
 * what the cards and the house page used to show as "asking". This copies
 * that same figure into `properties.list_price`, so the listing price reads
 * what the owner has been seeing all along. It writes that one column, and
 * only where it is still empty.
 *
 * A house whose numbers carry no typed price is left alone: the calculator's
 * $350,000 default is never copied in as if it were a price.
 *
 * DRY RUN BY DEFAULT: it lists every house and the price it would set. Pass
 * --write to apply. Writes to the live database, so it runs only on the
 * owner's word.
 *
 *   node_modules/.bin/jiti scripts/backfill-list-price.ts
 *   node_modules/.bin/jiti scripts/backfill-list-price.ts --write
 *
 * No outside services: it only reads and writes this app's own tables.
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
import {
  primaryFinancingByProperty,
  storedHomeValue,
  type AnalysisRow,
} from "../lib/screen/primaryFinancing";

interface UnpricedRow {
  id: string;
  address_line1: string;
  city: string | null;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    process.exit(1);
  }

  const write = process.argv.includes("--write");
  const db = createClient(url, key);

  const { data: houses, error } = await db
    .from("properties")
    .select("id, address_line1, city")
    .is("list_price", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`Could not read the houses: ${error.message}`);
    process.exit(1);
  }

  const rows = (houses ?? []) as UnpricedRow[];
  if (rows.length === 0) {
    console.log("Every house already has a listing price. Nothing to do.");
    return;
  }

  const { data: analyses, error: analysisError } = await db
    .from("analyses")
    .select("property_id, kind, is_primary, label, inputs, inputs_version")
    .in(
      "property_id",
      rows.map((row) => row.id)
    )
    .is("archived_at", null);

  if (analysisError) {
    console.error(`Could not read the numbers: ${analysisError.message}`);
    process.exit(1);
  }

  const primary = primaryFinancingByProperty((analyses ?? []) as AnalysisRow[]);

  console.log(`${rows.length} house(s) without a listing price.\n`);

  let priced = 0;
  let skipped = 0;
  let failedWrites = 0;

  for (const row of rows) {
    const where = [row.address_line1, row.city].filter(Boolean).join(", ");
    const price = storedHomeValue(primary.get(row.id)?.inputs);

    if (price === null) {
      skipped += 1;
      console.log(`  ✗ ${row.id}  ${where}  — no price in its numbers, left empty`);
      continue;
    }

    if (!write) {
      priced += 1;
      console.log(`  → ${row.id}  ${where}  — would set ${money(price)}`);
      continue;
    }

    // Empty-checked again on the write, so a price typed since the read is
    // not overwritten.
    const { error: updateError } = await db
      .from("properties")
      .update({ list_price: price })
      .eq("id", row.id)
      .is("list_price", null);

    if (updateError) {
      failedWrites += 1;
      console.log(`  ! ${row.id}  ${where}  — not saved: ${updateError.message}`);
    } else {
      priced += 1;
      console.log(`  ✓ ${row.id}  ${where}  — set to ${money(price)}`);
    }
  }

  console.log(
    `\n${write ? "Set" : "Would set"} ${priced}. Left empty: ${skipped}.` +
      (failedWrites > 0 ? ` ${failedWrites} failed to save.` : "")
  );
  if (!write) console.log("\nDry run. Re-run with --write to apply.");
  if (failedWrites > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
