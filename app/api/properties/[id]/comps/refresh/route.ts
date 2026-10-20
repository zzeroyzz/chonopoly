import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, canForceRentCastRefresh } from "@/lib/context";
import { getProperty } from "@/lib/property/propertyService";
import { normalizeAddress } from "@/lib/property/address";
import {
  listComps,
  saveRentCastComps,
  applySubjectFacts,
} from "@/lib/comps/compService";
import { calculateArv, subjectOptions } from "@/lib/comps/arv";
import { mapComparables, mapSubjectFacts } from "@/lib/comps/fromRentCast";
import {
  fetchValueEstimate,
  COMP_COUNT_DEFAULT,
  DEFAULT_MAX_RADIUS_MILES,
  DEFAULT_DAYS_OLD,
  rentCastMode,
  hasApiKey,
  CACHE_WINDOW_DAYS,
  VALUE_ESTIMATE_ENDPOINT,
  MockModeWriteError,
  type RentCastFailure,
} from "@/lib/rentcast/client";
import {
  getUsage,
  findCachedResponse,
  findLatestResponse,
  claimRequest,
  completeRequest,
  abandonClaim,
  clearStaleClaims,
} from "@/lib/rentcast/quota";
import { type RentCastValueResponse } from "@/lib/rentcast/types";
import { type RequestContext } from "@/lib/context";

/**
 * Pull comps for a property, spending at most one RentCast request per house
 * per 30 days.
 *
 * Four gates before anything is billed, cheapest first:
 *
 *   1. the monthly cap    — stop at 45 of 50, leaving headroom for their count
 *   2. the 30-day cache   — reuse a stored response for this address
 *   3. the in-flight lock — one call per address, across serverless instances
 *   4. the call
 *
 * The response body is written to `rentcast_requests` BEFORE anything parses
 * it, so a crash downstream costs nothing: a rebuild reconstructs the comps
 * from the stored body with no new call. The first live lookup crashed after a
 * successful response and kept nothing, which is the failure this ordering
 * exists to make impossible.
 *
 * Every response from this route is JSON, including a failure.
 */

/**
 * Which endpoint this route's cache, lock and stored responses belong to.
 *
 * Passed explicitly into every quota call rather than assumed, so a second
 * endpoint cannot inherit this one's 30-day window. Imported rather than
 * retyped — the string is part of the cache key.
 */
const ENDPOINT = VALUE_ESTIMATE_ENDPOINT;

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
}

function addressFor(property: PropertyRow): string {
  return [property.address_line1, property.city, property.state, property.zip]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
}

function normalizedFor(row: PropertyRow): string {
  return normalizeAddress({
    addressLine1: row.address_line1,
    city: row.city,
    state: row.state,
    zip: row.zip,
  });
}

/**
 * The specs RentCast matches on that this house does not have yet.
 *
 * Only sqft and beds: those two are what the comp search is actually built
 * around, and demanding baths or year built as well would stop a lookup that
 * would have been fine.
 */
function describeMissingFacts(row: PropertyRow): string[] {
  const missing: string[] = [];
  if (!row.sqft) missing.push("square footage");
  if (!row.beds) missing.push("bedroom count");
  return missing;
}

/** ["a", "b"] -> "a and b". Two items at most here, so no serial comma. */
function joinPlainly(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function nextRefreshIn(days: number): string {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await refresh(request, params);
  } catch (e) {
    // A refused fixture write is a configuration answer, not a server fault.
    // It reads as "nothing was stored", which is exactly what happened.
    if (e instanceof MockModeWriteError) {
      return NextResponse.json({ error: e.message, mode: "mock" }, { status: 409 });
    }
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

  const row = property as unknown as PropertyRow;
  const requestedAddress = addressFor(row);
  if (!requestedAddress.trim()) {
    return NextResponse.json({ error: "This property has no address to look up" }, { status: 400 });
  }

  // The cache key. Folds accents and canonicalizes suffixes, so
  // "1653 Sylvan Rd SW" and "1653 sylvan rd św" are one house and not two.
  const normalized = normalizedFor(row);

  const force = payload.force === true;
  const rebuildOnly = payload.rebuild === true;

  // ── Rebuild: never calls, by definition ────────────────────────────────────
  if (rebuildOnly) {
    const stored = await findLatestResponse(normalized, ENDPOINT, ctx);
    if (!stored) {
      return NextResponse.json({
        ...(await currentState(id, ctx, row)),
        degraded: "no_stored_response",
        message: "There's no saved RentCast response for this address to rebuild from.",
      });
    }
    return NextResponse.json(
      await applyResponse(stored.response, id, ctx, user.id, {
        source: "rebuilt",
        fetchedAt: stored.requestedAt,
        nextRefreshAt: stored.nextRefreshAt,
      })
    );
  }

  // ── Gate 1: the monthly cap ────────────────────────────────────────────────
  const usage = await getUsage(ctx);
  if (usage.atCap) {
    return NextResponse.json({
      ...(await currentState(id, ctx, row)),
      degraded: "monthly_cap",
      message: `The monthly RentCast limit of ${usage.cap} requests has been reached. Comps can still be entered by hand, and this resets next month.`,
      usage,
    });
  }

  // ── Gate 2: the 30-day cache ───────────────────────────────────────────────
  const cached = await findCachedResponse(normalized, ENDPOINT, ctx);

  if (cached && !force) {
    return NextResponse.json(
      await applyResponse(cached.response, id, ctx, user.id, {
        source: "cached",
        fetchedAt: cached.requestedAt,
        nextRefreshAt: cached.nextRefreshAt,
        usage,
      })
    );
  }

  // A forced refresh inside the window spends a request from a shared monthly
  // allowance, so it is the owner's call. Checked against the stored role,
  // never against anything the client claimed.
  if (cached && force) {
    const allowed = await canForceRentCastRefresh(ctx, user.id);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Only the account owner can force a refresh inside the 30-day window.",
          nextRefreshAt: cached.nextRefreshAt,
        },
        { status: 403 }
      );
    }
  }

  // ── Gate 2b: don't spend a request on a house we can't describe ────────────
  //
  // RentCast picks the comps from the specs we send. With no sqft and no bed
  // count it returns whatever is nearby, and that answer is then cached for 30
  // days — so a blind lookup is not just wasted, it is locked in. 674 White
  // Bird Way went out this way and came back with fifteen comps between 1,938
  // and 2,505 sqft for a 1,357 sqft house, none of them usable.
  //
  // The facts arrive in the very same response, which is what makes this worth
  // stopping for: wait, fill them in, and the next lookup is aimed.
  const missingFacts = describeMissingFacts(row);
  if (missingFacts.length > 0 && payload.acknowledgeMissingFacts !== true) {
    return NextResponse.json({
      ...(await currentState(id, ctx, row)),
      degraded: "missing_facts",
      missingFacts,
      message:
        `This house has no ${joinPlainly(missingFacts)} yet, and RentCast picks the comps using ` +
        `${missingFacts.length === 1 ? "it" : "them"}. A lookup now comes back with whatever is ` +
        `nearby, and that answer is saved for ${CACHE_WINDOW_DAYS} days. Add the ` +
        `${joinPlainly(missingFacts)} on the House tab first, or look up anyway.`,
      usage,
    });
  }

  // ── Gate 3: the in-flight lock ─────────────────────────────────────────────
  await clearStaleClaims(normalized, ENDPOINT, ctx);

  const claim = await claimRequest(normalized, ENDPOINT, requestedAddress, id, ctx);
  if (!claim.claimed) {
    // Someone else is already calling for this address. Returning what we hold
    // beats spending a second request on the same answer.
    return NextResponse.json({
      ...(await currentState(id, ctx, row)),
      degraded: "in_flight",
      message: "A lookup for this address is already running. Give it a moment and reload.",
      usage,
    });
  }

  // ── Gate 4: the call ───────────────────────────────────────────────────────
  let result;
  try {
    result = await fetchValueEstimate({
      address: requestedAddress,
      compCount: Number(payload.compCount) || COMP_COUNT_DEFAULT,
      maxRadius: Number(payload.maxRadius) || DEFAULT_MAX_RADIUS_MILES,
      daysOld: Number(payload.daysOld) || DEFAULT_DAYS_OLD,
      // Only sent when known. A guessed sqft produces confidently wrong comps.
      ...(row.sqft ? { squareFootage: row.sqft } : {}),
      ...(row.beds ? { bedrooms: row.beds } : {}),
      ...(row.baths ? { bathrooms: row.baths } : {}),
      // Never sent before, and never checked either, so a townhouse could be a
      // comp for a detached house.
      ...(row.property_type ? { propertyType: row.property_type } : {}),
    });
  } catch (e) {
    // The claim must not outlive the attempt, or this address stays locked.
    await abandonClaim(claim.requestId, e instanceof Error ? e.message : "Call threw");
    throw e;
  }

  // Recorded body-first, before anything parses it. From here on, a crash is
  // recoverable with no new request.
  await completeRequest({
    requestId: claim.requestId,
    succeeded: result.ok,
    statusCode: result.statusCode,
    billable: result.billable,
    // The message, never the key. Nothing secret reaches this column.
    error: result.ok ? null : result.message,
    responseBody: result.ok ? result.data : null,
  });

  const usageAfter = await getUsage(ctx);

  if (!result.ok) {
    return NextResponse.json({
      ...(await currentState(id, ctx, row)),
      degraded: result.failure,
      message: DEGRADED_MESSAGES[result.failure],
      usage: usageAfter,
    });
  }

  return NextResponse.json(
    await applyResponse(result.data, id, ctx, user.id, {
      source: result.mode === "mock" ? "mock" : "live",
      fetchedAt: new Date().toISOString(),
      nextRefreshAt: nextRefreshIn(CACHE_WINDOW_DAYS),
      usage: usageAfter,
    })
  );
}

/** What the tab should show when nothing new could be fetched. */
async function currentState(propertyId: string, ctx: RequestContext, row: PropertyRow) {
  const comps = await listComps(propertyId, ctx);
  return {
    comps,
    arv: calculateArv(comps, row.sqft ?? null, subjectOptions(row)),
    subjectBeds: row.beds ?? null,
  };
}

interface ApplyMeta {
  source: "live" | "cached" | "rebuilt" | "mock";
  fetchedAt: string;
  nextRefreshAt: string;
  usage?: Awaited<ReturnType<typeof getUsage>>;
}

/**
 * Turn a response body into stored comps and facts.
 *
 * Shared by the live path, the cache path and the rebuild path so all three
 * produce identical state. A separate rebuild implementation would be a second
 * place for the mapping to drift.
 */
async function applyResponse(
  response: RentCastValueResponse,
  propertyId: string,
  ctx: RequestContext,
  userId: string,
  meta: ApplyMeta
) {
  const mapped = mapComparables(response.comparables);

  await applySubjectFacts(propertyId, mapSubjectFacts(response.subjectProperty), ctx);

  const comps = await saveRentCastComps(propertyId, mapped, ctx, userId);

  // Re-read: the subject's sqft may have just been filled in, and the ARV
  // depends on it.
  const refreshed = (await getProperty(propertyId, ctx)) as unknown as PropertyRow | null;
  const subjectSqft = refreshed?.sqft ?? null;
  const subjectBeds = refreshed?.beds ?? null;

  return {
    degraded: mapped.length === 0 ? "no_comps" : null,
    message:
      mapped.length === 0
        ? "RentCast found no comparable sales near this address. Enter comps by hand."
        : null,
    comps,
    // Was calculateArv(comps, subjectSqft) with no subjectBeds, so the bedroom
    // filter was skipped right after a refresh and applied again on reload —
    // the same house showing two different ARVs depending on how you got there.
    arv: refreshed
      ? calculateArv(comps, subjectSqft, subjectOptions(refreshed))
      : calculateArv(comps, subjectSqft),
    // The panel reads this to show each comp's fit reason. Omitting it blanked
    // the bedroom reason after every refresh.
    subjectBeds,
    estimate: {
      price: response.price ?? null,
      priceRangeLow: response.priceRangeLow ?? null,
      priceRangeHigh: response.priceRangeHigh ?? null,
    },
    source: meta.source,
    fetchedAt: meta.fetchedAt,
    nextRefreshAt: meta.nextRefreshAt,
    ...(meta.usage ? { usage: meta.usage } : {}),
  };
}

/** The GET side: what the tab needs to know before anyone presses anything. */
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
    const property = await getProperty(id, ctx);
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const row = property as unknown as PropertyRow;
    const normalized = normalizedFor(row);

    const [usage, cached, stored, canForce] = await Promise.all([
      getUsage(ctx),
      findCachedResponse(normalized, ENDPOINT, ctx),
      findLatestResponse(normalized, ENDPOINT, ctx),
      canForceRentCastRefresh(ctx, user.id),
    ]);

    return NextResponse.json({
      usage,
      mode: rentCastMode(),
      // Mock mode is "connected" for the UI's purposes: it serves fixtures
      // happily and a refresh there is useful. Only a missing key means
      // nothing can be pulled at all.
      connected: hasApiKey() || rentCastMode() === "mock",
      endpoint: ENDPOINT,
      /** Locked means a refresh would reuse the cache rather than call. */
      locked: Boolean(cached),
      fetchedAt: cached?.requestedAt ?? null,
      nextRefreshAt: cached?.nextRefreshAt ?? null,
      canForce,
      canRebuild: Boolean(stored),
      windowDays: CACHE_WINDOW_DAYS,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to read refresh status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
