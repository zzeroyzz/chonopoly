import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getProperty } from "@/lib/property/propertyService";
import {
  listComps,
  saveRentCastComps,
  applySubjectFacts,
  logRentCastRequest,
  getUsageThisMonth,
} from "@/lib/comps/compService";
import { calculateArv } from "@/lib/comps/arv";
import { mapComparables, mapSubjectFacts } from "@/lib/comps/fromRentCast";
import {
  fetchValueEstimate,
  FREE_PLAN_MONTHLY_REQUESTS,
  COMP_COUNT_DEFAULT,
  DEFAULT_MAX_RADIUS_MILES,
  DEFAULT_DAYS_OLD,
  type RentCastFailure,
} from "@/lib/rentcast/client";

/**
 * Pull comps for a property from RentCast.
 *
 * Degrades rather than fails. No key, a dead quota or zero comps are all
 * answers this route returns 200 with — each one carrying a `degraded` reason
 * the UI turns into a sentence and a way forward (type the comps in by hand).
 * The only non-2xx responses here are auth, a bad request and a genuine server
 * fault, because a screening run over five houses must not lose the other four
 * to one address RentCast has never heard of.
 */

const ENDPOINT = "/avm/value";

/** What the user can actually do about each failure. */
const DEGRADED_MESSAGES: Record<RentCastFailure, string> = {
  no_key: "RentCast isn't connected, so comps have to be entered by hand.",
  quota: "This month's RentCast requests are used up. Comps can still be entered by hand.",
  rate_limited: "RentCast is rate limiting requests. Try again in a minute.",
  not_found: "RentCast has no data for this address. Enter comps by hand.",
  http_error: "RentCast couldn't be reached. Comps can still be entered by hand.",
  network_error: "RentCast couldn't be reached. Comps can still be entered by hand.",
  bad_response: "RentCast returned something unreadable. Comps can still be entered by hand.",
};

function addressFor(property: {
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}): string {
  return [property.address_line1, property.city, property.state, property.zip]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
}

/**
 * Every response from this route is JSON, including a failure.
 *
 * An unhandled throw here used to produce a 500 with an empty body, which the
 * client then tried to parse — turning a readable PostgREST message into
 * "Unexpected end of JSON input" and hiding the actual cause. A route the UI
 * parses must never be able to answer with something unparseable.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await refresh(request, params);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to refresh comps";
    console.error("Comps refresh failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function refresh(request: Request, params: Promise<{ id: string }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: Record<string, unknown> = {};
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null) payload = body as Record<string, unknown>;
  } catch {
    // An empty body is fine — every parameter has a default.
  }

  const ctx = await resolveContext(
    typeof payload.context_type === "string" ? payload.context_type : undefined,
    typeof payload.context_id === "string" ? payload.context_id : undefined,
    user.id
  );
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const property = await getProperty(id, ctx);
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const address = addressFor(property);
  if (!address.trim()) {
    return NextResponse.json({ error: "This property has no address to look up" }, { status: 400 });
  }

  const result = await fetchValueEstimate({
    address,
    compCount: Number(payload.compCount) || COMP_COUNT_DEFAULT,
    maxRadius: Number(payload.maxRadius) || DEFAULT_MAX_RADIUS_MILES,
    daysOld: Number(payload.daysOld) || DEFAULT_DAYS_OLD,
    // Only sent when known. A guessed sqft produces confidently wrong comps.
    ...(property.sqft ? { squareFootage: property.sqft } : {}),
    ...(property.beds ? { bedrooms: property.beds } : {}),
    ...(property.baths ? { bathrooms: property.baths } : {}),
  });

  await logRentCastRequest(
    {
      propertyId: id,
      endpoint: ENDPOINT,
      statusCode: result.statusCode,
      succeeded: result.ok,
      billable: result.billable,
      // The message, never the key. Nothing secret reaches this column.
      error: result.ok ? null : result.message,
    },
    ctx
  );

  const usage = await getUsageThisMonth(ctx, FREE_PLAN_MONTHLY_REQUESTS).catch(() => null);

  if (!result.ok) {
    // 200 with a reason. The comps already held are returned unchanged so the
    // tab does not empty itself because a refresh failed.
    const comps = await listComps(id, ctx);
    return NextResponse.json({
      degraded: result.failure,
      message: DEGRADED_MESSAGES[result.failure],
      comps,
      arv: calculateArv(comps, property.sqft ?? null),
      usage,
    });
  }

  const mapped = mapComparables(result.data.comparables);

  // Subject facts come from the same call, so there is no second request. Only
  // blank columns are filled, so anything a person typed is left alone.
  await applySubjectFacts(id, mapSubjectFacts(result.data.subjectProperty), ctx);

  const comps = await saveRentCastComps(id, mapped, ctx, user.id);
  const refreshed = await getProperty(id, ctx);
  const subjectSqft = refreshed?.sqft ?? property.sqft ?? null;

  return NextResponse.json({
    // A successful call that returned nothing is still a dead end for the user,
    // so it carries a reason rather than looking like an empty success.
    degraded: mapped.length === 0 ? "no_comps" : null,
    message:
      mapped.length === 0
        ? "RentCast found no comparable sales near this address. Enter comps by hand."
        : null,
    comps,
    arv: calculateArv(comps, subjectSqft),
    estimate: {
      price: result.data.price ?? null,
      priceRangeLow: result.data.priceRangeLow ?? null,
      priceRangeHigh: result.data.priceRangeHigh ?? null,
    },
    usage,
  });
}
