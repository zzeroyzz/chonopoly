import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, canForceRentCastRefresh } from "@/lib/context";
import { getProperty } from "@/lib/property/propertyService";
import { normalizeAddress } from "@/lib/property/address";
import { listComps, savePublicRecordComps } from "@/lib/comps/compService";
import { calculateArv, subjectOptions } from "@/lib/comps/arv";
import { mapPropertyRecords } from "@/lib/comps/fromPropertyRecords";
import {
  fetchPropertyRecords,
  RECORDED_SALES_LIMIT,
  rentCastMode,
  hasApiKey,
  CACHE_WINDOW_DAYS,
  PROPERTY_RECORDS_ENDPOINT,
  MockModeWriteError,
} from "@/lib/rentcast/client";
import {
  getUsage,
  type RentCastResponseBody,
  findCachedResponse,
  findLatestResponse,
  claimRequest,
  completeRequest,
  abandonClaim,
  clearStaleClaims,
} from "@/lib/rentcast/quota";
import { type RentCastPropertyRecord } from "@/lib/rentcast/types";
import {
  DEGRADED_MESSAGES,
  IN_FLIGHT_MESSAGE,
  NO_COMPS_MESSAGE,
} from "@/lib/comps/refreshMessages";
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
const ENDPOINT = PROPERTY_RECORDS_ENDPOINT;

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

/**
 * A stored body for this endpoint is an array of records.
 *
 * Anything else is a row written before the cache became endpoint-aware.
 * Returning null rather than mapping an object into zero sales: "no comps
 * found" and "we replayed the wrong kind of response" look identical on
 * screen and are not the same problem.
 */
function recordsFrom(body: RentCastResponseBody): RentCastPropertyRecord[] | null {
  return Array.isArray(body) ? body : null;
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
    const storedRecords = recordsFrom(stored.response);
    if (!storedRecords) {
      return NextResponse.json({
        ...(await currentState(id, ctx, row)),
        degraded: "no_stored_response",
        message:
          "The saved response for this address is from the old listings lookup, so there are no recorded sales to rebuild from.",
      });
    }
    return NextResponse.json(
      await applyResponse(storedRecords, id, ctx, user.id, {
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

  const cachedRecords = cached ? recordsFrom(cached.response) : null;

  if (cached && cachedRecords && !force) {
    return NextResponse.json(
      await applyResponse(cachedRecords, id, ctx, user.id, {
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
  // /properties does not filter on size or beds — it returns every recorded
  // sale of a single-family house within a mile. Those facts are what decides
  // which of them are comparable afterwards, in compEligibility. Without
  // them, every sale that comes back is kept, the ARV is a median of whatever
  // sold nearby, and the answer is cached for 30 days.
  //
  // No override. There is nothing useful to do with the response until the
  // facts exist, so the button goes to the form instead.
  const missingFacts = describeMissingFacts(row);
  if (missingFacts.length > 0) {
    return NextResponse.json({
      ...(await currentState(id, ctx, row)),
      degraded: "missing_facts",
      missingFacts,
      message:
        `Add this house's size and bedrooms to pull sales. Without them every ` +
        `sale nearby counts as a comparison, and the answer is saved for ` +
        `${CACHE_WINDOW_DAYS} days.`,
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
      message: IN_FLIGHT_MESSAGE,
      usage,
    });
  }

  // ── Gate 4: the call ───────────────────────────────────────────────────────
  let result;
  try {
    // Only propertyType, radius, saleDateRange and limit. The API supports
    // size, bed, bath and year ranges and we deliberately do not send them:
    // filtering locally means the full response is stored and can be rebuilt
    // for free when the tolerances change. A server-side filter bakes today's
    // rules into data we have already paid for.
    result = await fetchPropertyRecords({ address: requestedAddress });
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
 * Turn a stored /properties body into recorded sales on this house.
 *
 * Shared by the live path, the cache path and the rebuild path so all three
 * produce identical state. A separate rebuild implementation would be a second
 * place for the mapping to drift.
 *
 * No subject facts are applied here. /properties describes the comps, not the
 * house being valued — the owner enters its size, beds, baths and year built,
 * and nothing in this path may overwrite them.
 *
 * Listings already stored from /avm/value are left exactly where they are.
 * savePublicRecordComps is scoped to source = 'public_record', so an old
 * house keeps its Active and Removed rows beside its new sales.
 */
async function applyResponse(
  records: RentCastPropertyRecord[],
  propertyId: string,
  ctx: RequestContext,
  userId: string,
  meta: ApplyMeta
) {
  const sales = mapPropertyRecords(records);

  const comps = await savePublicRecordComps(propertyId, sales, ctx, userId);

  const refreshed = (await getProperty(propertyId, ctx)) as unknown as PropertyRow | null;
  const subjectSqft = refreshed?.sqft ?? null;
  const subjectBeds = refreshed?.beds ?? null;

  return {
    degraded: sales.length === 0 ? "no_comps" : null,
    message:
      sales.length === 0
        ? NO_COMPS_MESSAGE
        : null,
    // A full page of records means there are probably more we did not see.
    atRecordLimit: records.length >= RECORDED_SALES_LIMIT,
    comps,
    arv: refreshed
      ? calculateArv(comps, subjectSqft, subjectOptions(refreshed))
      : calculateArv(comps, subjectSqft),
    subjectBeds,
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
