import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import {
  getProperty,
  updatePropertyFacts,
  setFinalist,
  type PropertyFactsPatch,
} from "@/lib/property/propertyService";
import { getDetail, getDetailByProperty } from "@/lib/crm/detailService";

/**
 * Read and edit one house's own facts.
 *
 * Separate from the CRM entry route, which owns the pipeline side — the stage,
 * the tasks, the contacts. This owns what the house IS: its address, size and
 * type. The two were conflated before, which left the facts read-only because
 * nothing could write them.
 */

const PROPERTY_TYPES = new Set([
  "single_family",
  "multi_family",
  "condo",
  "townhouse",
  "land",
  "mobile",
  "other",
]);

/** Null clears the field; an absent key leaves it alone. Those differ. */
function numberOrNullOrSkip(
  value: unknown,
  field: string
): { skip: true } | { skip: false; value: number | null } {
  if (value === undefined) return { skip: true };
  if (value === null || value === "") return { skip: false, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be a number of zero or more`);
  return { skip: false, value: n };
}

function textOrNullOrSkip(value: unknown): { skip: true } | { skip: false; value: string | null } {
  if (value === undefined) return { skip: true };
  if (value === null) return { skip: false, value: null };
  const text = String(value).trim();
  return { skip: false, value: text || null };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const ctx = await resolveContext(
      searchParams.get("context_type") ?? undefined,
      searchParams.get("context_id") ?? undefined,
      user.id
    );
    if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    // `detail=1` returns everything the property page shows. Without it this
    // stays the lean property-only read the calculator's binding uses.
    if (searchParams.get("detail") === "1") {
      // Resolve as a property first, then fall back to a pipeline entry id.
      // Both forms are live: the Properties list links by property, and
      // /crm/<entryId> redirects still arrive here carrying an entry id.
      const detail =
        (await getDetailByProperty(id, ctx)) ?? (await getDetail(id, ctx));

      if (!detail) return NextResponse.json({ error: "Property not found" }, { status: 404 });
      return NextResponse.json({ detail });
    }

    const property = await getProperty(id, ctx);
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    return NextResponse.json({ property });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load the house";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { id: patchId } = await params;

    // Marking a finalist is its own small edit, not a fact about the building,
    // so it short-circuits the facts patch below.
    if (typeof payload.is_finalist === "boolean") {
      try {
        const isFinalist = await setFinalist(patchId, payload.is_finalist, ctx);
        return NextResponse.json({ isFinalist });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to set the finalist flag";
        // "needs the migration" is a configuration answer, not a server fault.
        const status = message.includes("migration") ? 409 : 500;
        return NextResponse.json({ error: message }, { status });
      }
    }

    const { id } = await params;
    const patch: PropertyFactsPatch = {};

    // Validated at the boundary, naming the field rather than the value.
    if (payload.addressLine1 !== undefined) {
      const line = String(payload.addressLine1).trim();
      if (!line) {
        return NextResponse.json({ error: "addressLine1 cannot be empty" }, { status: 400 });
      }
      patch.addressLine1 = line;
    }

    const city = textOrNullOrSkip(payload.city);
    if (!city.skip) patch.city = city.value;

    if (payload.state !== undefined) {
      const state = String(payload.state).trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(state)) {
        return NextResponse.json({ error: "state must be two letters" }, { status: 400 });
      }
      patch.state = state;
    }

    const zip = textOrNullOrSkip(payload.zip);
    if (!zip.skip) patch.zip = zip.value;

    if (payload.propertyType !== undefined) {
      const type = String(payload.propertyType);
      if (!PROPERTY_TYPES.has(type)) {
        return NextResponse.json({ error: "propertyType is not a known type" }, { status: 400 });
      }
      patch.propertyType = type;
    }

    try {
      for (const [key, field] of [
        ["beds", "beds"],
        ["baths", "baths"],
        ["sqft", "sqft"],
        ["lotSqft", "lotSqft"],
        ["yearBuilt", "yearBuilt"],
        ["annualTaxes", "annualTaxes"],
        ["listPrice", "listPrice"],
      ] as const) {
        const parsed = numberOrNullOrSkip(payload[key], field);
        if (!parsed.skip) {
          Object.assign(patch, { [key]: parsed.value });
        }
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid number" },
        { status: 400 }
      );
    }

    if (patch.yearBuilt !== undefined && patch.yearBuilt !== null) {
      if (patch.yearBuilt < 1600 || patch.yearBuilt > 2200) {
        return NextResponse.json(
          { error: "yearBuilt must be between 1600 and 2200" },
          { status: 400 }
        );
      }
    }

    const listingUrl = textOrNullOrSkip(payload.listingUrl);
    if (!listingUrl.skip) {
      if (listingUrl.value && !/^https?:\/\//i.test(listingUrl.value)) {
        return NextResponse.json(
          { error: "listingUrl must start with http:// or https://" },
          { status: 400 }
        );
      }
      patch.listingUrl = listingUrl.value;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const property = await updatePropertyFacts(id, patch, ctx);
    return NextResponse.json({ property });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update the house";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
