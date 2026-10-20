import "server-only";

import { createClient } from "@supabase/supabase-js";
import { type Database, type Json } from "../supabase/database.types";
import { type RequestContext } from "../context";
import { type RentCastValueResponse } from "./types";
import {
  MONTHLY_REQUEST_CAP,
  CACHE_WINDOW_DAYS,
  FREE_PLAN_MONTHLY_REQUESTS,
  assertNotMockMode,
} from "./client";

/**
 * Everything that stands between a button press and a billable request.
 *
 * The free plan is 50 requests a month and the goal is one request per house
 * per 30 days no matter who presses what. Four gates, in this order, because
 * each one is cheaper than the next:
 *
 *   1. the monthly cap      — a counter read
 *   2. the 30-day cache     — one indexed row read, no call
 *   3. the in-flight lock   — one insert that either wins or doesn't
 *   4. the call itself
 *
 * The lock is a database row rather than a mutex, and that is not incidental:
 * this app runs as serverless functions, so two taps can land on two instances
 * that share no memory. An in-process lock would see nothing and both would
 * call.
 */

/**
 * Typed against the generated schema. Regenerate with `npm run db:types` after
 * every migration — a column that does not exist should be a compile error,
 * never a 500.
 */
function db() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Every key in this file is (owner, endpoint, address), never (owner, address).
 *
 * The endpoint used to be a module constant here, from when /avm/value was the
 * only one. That made the 30-day cache and the in-flight lock blind to which
 * endpoint a response came from: a house with a week-old listing response
 * would have that response handed back as the cache hit for its first
 * recorded-sales pull, and the lock would refuse to hold both at once. A house
 * could not make its first /properties call until the old window expired.
 */

/** Postgres unique-violation. The second caller losing the lock race. */
const UNIQUE_VIOLATION = "23505";

export interface UsageSnapshot {
  used: number;
  /** Where we stop calling — below the plan limit on purpose. */
  cap: number;
  /** The plan's real limit, for display. */
  planLimit: number;
  remaining: number;
  atCap: boolean;
  monthStart: string;
}

/**
 * Billable requests this calendar month, against the cap.
 *
 * Calendar month is an approximation of RentCast's subscription period and is
 * named as one. It can read low near a boundary, which is why the cap sits
 * below the plan limit rather than at it.
 */
export async function getUsage(
  ctx: RequestContext,
  now: Date = new Date()
): Promise<UsageSnapshot> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const { count, error } = await db()
    .from("rentcast_requests")
    .select("id", { count: "exact", head: true })
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("billable", true)
    .gte("requested_at", monthStart.toISOString());

  if (error) throw new Error(`Failed to read RentCast usage: ${error.message}`);

  const used = count ?? 0;
  return {
    used,
    cap: MONTHLY_REQUEST_CAP,
    planLimit: FREE_PLAN_MONTHLY_REQUESTS,
    remaining: Math.max(0, MONTHLY_REQUEST_CAP - used),
    atCap: used >= MONTHLY_REQUEST_CAP,
    monthStart: monthStart.toISOString(),
  };
}

export interface CachedResponse {
  requestId: string;
  response: RentCastValueResponse;
  requestedAt: string;
  /** When this address may be looked up again. */
  nextRefreshAt: string;
  propertyId: string | null;
}

function nextRefreshFrom(requestedAt: string): string {
  const next = new Date(requestedAt);
  next.setUTCDate(next.getUTCDate() + CACHE_WINDOW_DAYS);
  return next.toISOString();
}

/**
 * The most recent stored response for this address, if it is inside the window.
 *
 * Keyed on the normalized address and NOT on property_id, deliberately. The
 * request that started all this was spent on "1653 sylvan rd św" while a second
 * row for "1653 sylvan rd sw" existed — the same house, two property rows. A
 * property-keyed cache would have called again for the duplicate.
 */
export async function findCachedResponse(
  normalizedAddress: string,
  endpoint: string,
  ctx: RequestContext,
  now: Date = new Date()
): Promise<CachedResponse | null> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - CACHE_WINDOW_DAYS);

  const { data, error } = await db()
    .from("rentcast_requests")
    .select("id, response_body, requested_at, property_id")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("endpoint", endpoint)
    .eq("normalized_address", normalizedAddress)
    .eq("state", "succeeded")
    .not("response_body", "is", null)
    .gte("requested_at", cutoff.toISOString())
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to check the RentCast cache: ${error.message}`);
  if (!data?.response_body) return null;

  return {
    requestId: data.id,
    response: data.response_body as unknown as RentCastValueResponse,
    requestedAt: data.requested_at,
    nextRefreshAt: nextRefreshFrom(data.requested_at),
    propertyId: data.property_id,
  };
}

/** The newest stored response for an address regardless of age — for rebuilds. */
export async function findLatestResponse(
  normalizedAddress: string,
  endpoint: string,
  ctx: RequestContext
): Promise<CachedResponse | null> {
  const { data, error } = await db()
    .from("rentcast_requests")
    .select("id, response_body, requested_at, property_id")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("endpoint", endpoint)
    .eq("normalized_address", normalizedAddress)
    .eq("state", "succeeded")
    .not("response_body", "is", null)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to read the stored response: ${error.message}`);
  if (!data?.response_body) return null;

  return {
    requestId: data.id,
    response: data.response_body as unknown as RentCastValueResponse,
    requestedAt: data.requested_at,
    nextRefreshAt: nextRefreshFrom(data.requested_at),
    propertyId: data.property_id,
  };
}

export type ClaimResult =
  | { claimed: true; requestId: string }
  | { claimed: false; reason: "in_flight" };

/**
 * Claim the right to call RentCast for this address.
 *
 * Inserts the `in_flight` row that a unique partial index allows only one of.
 * Winning the insert is the permission; losing it means someone else is already
 * calling, and the caller should wait rather than spend a second request.
 *
 * The row is created BEFORE the call so that the response has somewhere to land
 * the instant it arrives. The first live lookup crashed after a successful
 * response with nowhere to put it, which spent a request and kept nothing.
 */
export async function claimRequest(
  normalizedAddress: string,
  endpoint: string,
  requestedAddress: string,
  propertyId: string | null,
  ctx: RequestContext
): Promise<ClaimResult> {
  // The lock IS a row, so claiming one in mock mode writes to the database and
  // can leave a real house locked against a refresh it never made.
  assertNotMockMode("a RentCast request lock");

  const { data, error } = await db()
    .from("rentcast_requests")
    .insert({
      owner_type: ctx.type,
      owner_id: ctx.id,
      property_id: propertyId,
      endpoint,
      normalized_address: normalizedAddress,
      requested_address: requestedAddress,
      state: "in_flight",
      // Not yet known. Set when the attempt completes.
      succeeded: false,
      billable: false,
      status_code: null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { claimed: false, reason: "in_flight" };
    throw new Error(`Failed to claim a RentCast request: ${error.message}`);
  }

  return { claimed: true, requestId: data.id };
}

export interface CompleteRequestInput {
  requestId: string;
  succeeded: boolean;
  statusCode: number | null;
  billable: boolean;
  error: string | null;
  /** Stored before anything parses it. The whole point of the exercise. */
  responseBody: RentCastValueResponse | null;
}

/**
 * Record the outcome and release the lock.
 *
 * Writes the response body in the same statement that clears `in_flight`, so a
 * successful request is never recorded as finished without the body it paid
 * for.
 */
export async function completeRequest(input: CompleteRequestInput): Promise<void> {
  const { error } = await db()
    .from("rentcast_requests")
    .update({
      state: input.succeeded ? "succeeded" : "failed",
      succeeded: input.succeeded,
      status_code: input.statusCode,
      billable: input.billable,
      error: input.error,
      response_body: (input.responseBody ?? null) as Json,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.requestId);

  if (error) throw new Error(`Failed to record the RentCast request: ${error.message}`);
}

/**
 * Release a claim without recording an attempt.
 *
 * For the case where the call never happened — the cap was hit between the
 * check and the claim, say. Marked failed and explicitly not billable, because
 * nothing left the process.
 */
export async function abandonClaim(requestId: string, reason: string): Promise<void> {
  const { error } = await db()
    .from("rentcast_requests")
    .update({
      state: "failed",
      succeeded: false,
      billable: false,
      error: reason,
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  // Logged, not thrown. Failing to release a lock must not also fail the
  // response the caller is waiting on; the stale claim is swept below.
  if (error) console.error("Failed to abandon a RentCast claim:", error.message);
}

/** How long a claim may sit in flight before it is assumed dead. */
const STALE_CLAIM_MINUTES = 2;

/**
 * Clear claims left behind by a crashed invocation.
 *
 * Without this, a function killed mid-call leaves an `in_flight` row that locks
 * the address forever — the quota guard turning into a permanent outage for one
 * house. Runs before claiming, which is the only moment it matters.
 */
export async function clearStaleClaims(
  normalizedAddress: string,
  endpoint: string,
  ctx: RequestContext,
  now: Date = new Date()
): Promise<void> {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000);

  const { error } = await db()
    .from("rentcast_requests")
    .update({
      state: "failed",
      error: "Abandoned — no result recorded before the claim went stale.",
      completed_at: now.toISOString(),
    })
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("endpoint", endpoint)
    .eq("normalized_address", normalizedAddress)
    .eq("state", "in_flight")
    .lt("requested_at", cutoff.toISOString());

  if (error) console.error("Failed to clear stale RentCast claims:", error.message);
}

export { CACHE_WINDOW_DAYS, MONTHLY_REQUEST_CAP };
