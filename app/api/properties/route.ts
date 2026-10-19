import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { upsertProperty } from "@/lib/property/propertyService";

/**
 * Add one house.
 *
 * The single front door. Every other path that could once create a property
 * has been closed — saving an analysis, attaching an address to an unassigned
 * save, adding a lead to the pipeline — so this and the batch form beside it
 * are the only two, and they share `upsertProperty` and its dedupe rules.
 *
 * Only the address is required. Everything else is a fact the user happens to
 * know, and a fact they type wins: `applySubjectFacts` fills blanks only, so
 * RentCast can never overwrite a figure somebody entered by hand.
 */

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/** Only http(s), so a pasted `javascript:` URL cannot reach an href or an img. */
function urlOrNull(value: unknown): string | null {
  const text = textOrNull(value);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? text : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ctx = await resolveContext(
    typeof body.context_type === "string" ? body.context_type : undefined,
    typeof body.context_id === "string" ? body.context_id : undefined,
    user.id
  );
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const addressLine1 = textOrNull(body.address_line1);
  if (!addressLine1) {
    return NextResponse.json({ error: "A street address is required" }, { status: 400 });
  }

  try {
    const { property, matchedOn } = await upsertProperty(
      {
        address_line1: addressLine1,
        city: textOrNull(body.city),
        state: textOrNull(body.state) ?? "GA",
        zip: textOrNull(body.zip),
        parcel_number: textOrNull(body.parcel_number),
        beds: numberOrNull(body.beds),
        baths: numberOrNull(body.baths),
        sqft: numberOrNull(body.sqft),
        listing_url: urlOrNull(body.listing_url),
        photo_url: urlOrNull(body.photo_url),
      },
      ctx,
      user.id,
      "manual"
    );

    return NextResponse.json({ property, matchedOn, salesPrice: numberOrNull(body.sales_price) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add the house";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
