import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { upsertProperty } from "@/lib/property/propertyService";
import { parseAddressLines, type ParsedAddressLine } from "@/lib/property/parseAddressLines";
import { type PropertyMatch } from "@/lib/property/types";

/**
 * Add several houses from a pasted list.
 *
 * Every line goes through `upsertProperty`, so the dedupe rule — parcel first,
 * normalized address second — is the same one every other write path uses. A
 * probable address match reuses the row and flags it for review rather than
 * merging silently, because a false merge is worse than a duplicate.
 *
 * One failure never costs the batch. Each line is attempted independently and
 * reported on its own, so pasting twenty addresses with one typo saves
 * nineteen houses and tells you which line to fix.
 *
 * Deliberately does NOT call RentCast. The plan had a lookup per new house,
 * which would spend twenty requests of a fifty-request month on one paste
 * before anyone decided which houses were worth it. Comps are pulled per house
 * from the Comps tab, where the 30-day cache and the monthly cap apply.
 */

export interface BatchResultRow {
  lineNumber: number;
  raw: string;
  status: "created" | "matched" | "failed";
  propertyId: string | null;
  /** How the house was matched, when it was. */
  matchedOn: PropertyMatch | null;
  needsAddressReview: boolean;
  message: string | null;
}

const MAX_LINES = 100;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;

    const ctx = await resolveContext(
      typeof payload.context_type === "string" ? payload.context_type : undefined,
      typeof payload.context_id === "string" ? payload.context_id : undefined,
      user.id
    );
    if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (typeof payload.text !== "string" || !payload.text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const parsed = parseAddressLines(payload.text);

    if (parsed.houses.length > MAX_LINES) {
      return NextResponse.json(
        { error: `That's ${parsed.houses.length} addresses. The limit is ${MAX_LINES} at a time.` },
        { status: 400 }
      );
    }

    const results: BatchResultRow[] = [];

    // Parse failures are reported alongside the saves, in line order, so the
    // response maps one-to-one onto what the user pasted.
    for (const error of [...parsed.errors, ...parsed.duplicates]) {
      results.push({
        lineNumber: error.lineNumber,
        raw: error.raw,
        status: "failed",
        propertyId: null,
        matchedOn: null,
        needsAddressReview: false,
        message: error.message,
      });
    }

    for (const house of parsed.houses) {
      results.push(await saveOne(house, ctx, user.id));
    }

    results.sort((a, b) => a.lineNumber - b.lineNumber);

    return NextResponse.json({
      results,
      created: results.filter((r) => r.status === "created").length,
      matched: results.filter((r) => r.status === "matched").length,
      failed: results.filter((r) => r.status === "failed").length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add the houses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function saveOne(
  house: ParsedAddressLine,
  ctx: Awaited<ReturnType<typeof resolveContext>> & object,
  userId: string
): Promise<BatchResultRow> {
  try {
    const result = await upsertProperty(
      {
        address_line1: house.addressLine1,
        city: house.city,
        // The schema defaults to GA; only override when the line said so.
        ...(house.state ? { state: house.state } : {}),
        zip: house.zip,
        ...(house.listingUrl ? { listing_url: house.listingUrl } : {}),
        // The parser read the price off the line; it was then dropped here,
        // so a pasted "…, 250000" saved a house with no listing price.
        ...(house.price !== null ? { list_price: house.price } : {}),
      },
      ctx,
      userId,
      "import"
    );

    const matched = result.matchedOn !== "created";

    return {
      lineNumber: house.lineNumber,
      raw: house.raw,
      status: matched ? "matched" : "created",
      propertyId: result.property.id,
      matchedOn: result.matchedOn,
      needsAddressReview: result.property.needs_address_review,
      message:
        result.matchedOn === "parcel"
          ? "Matched an existing house by parcel"
          : result.matchedOn === "address"
            ? "Probable match to an existing house — flagged for review"
            : null,
    };
  } catch (e) {
    // One bad line must not lose the rest of the paste.
    return {
      lineNumber: house.lineNumber,
      raw: house.raw,
      status: "failed",
      propertyId: null,
      matchedOn: null,
      needsAddressReview: false,
      message: e instanceof Error ? e.message : "Could not be saved",
    };
  }
}
