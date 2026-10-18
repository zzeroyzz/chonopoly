import "server-only";

import {
  type RentCastValueResponse,
  type ValueEstimateParams,
} from "./types";
import fixture from "./fixtures/valueEstimate.json";

/**
 * RentCast API client. Server-only, enforced by the import above.
 *
 * The key must never reach the browser: there is no per-user quota, only one
 * account-wide allowance, so a leaked key is someone else spending the month's
 * 50 requests. `server-only` makes an accidental client import a build error
 * rather than a thing we notice in a bundle months later.
 *
 * Every outcome here is a value, not an exception. The screening flow has to
 * keep working with no key, a dead quota or zero comps — a thrown error in the
 * middle of adding five houses loses the other four.
 *
 * Docs: https://developers.rentcast.io/reference/value-estimate
 * Pricing: https://developers.rentcast.io/reference/billing-and-pricing
 */

const BASE = "https://api.rentcast.io/v1";

/** Free Developer plan. Foundation is 1,000, Growth 5,000, Scale 25,000. */
export const FREE_PLAN_MONTHLY_REQUESTS = 50;

/**
 * Stop calling here, five short of the plan limit.
 *
 * The gap is deliberate headroom. RentCast's own count is authoritative and
 * ours can only ever be an estimate of it — a request that times out locally
 * may still have been served and billed — so the app must stop before the real
 * ceiling rather than discover it by being cut off mid-screening.
 */
export const MONTHLY_REQUEST_CAP = 45;

/** One lookup per house per 30 days. */
export const CACHE_WINDOW_DAYS = 30;

/** Warn the user here rather than at the wall. */
export const QUOTA_WARNING_FRACTION = 0.8;

/** RentCast's own bounds on compCount. Sending 30 is a 400, not 25 comps. */
export const COMP_COUNT_MIN = 5;
export const COMP_COUNT_MAX = 25;
export const COMP_COUNT_DEFAULT = 15;

export const DEFAULT_MAX_RADIUS_MILES = 2;
export const DEFAULT_DAYS_OLD = 270;

/**
 * Why a lookup produced nothing.
 *
 * `no_key` and `quota` are deliberately distinct: one is a setup problem the
 * user can fix in Settings, the other is a wait-until-next-month problem. A
 * single "unavailable" state would send someone hunting for a key they already
 * have.
 */
export type RentCastFailure =
  | "no_key"
  | "quota"
  | "not_found"
  | "rate_limited"
  | "http_error"
  | "network_error"
  | "bad_response";

export type RentCastResult =
  | { ok: true; data: RentCastValueResponse; statusCode: number; billable: boolean; mode: RentCastMode }
  | {
      ok: false;
      failure: RentCastFailure;
      message: string;
      statusCode: number | null;
      billable: boolean;
      mode: RentCastMode;
    };

/**
 * `billable` means the HTTP request left this process — not that it came back
 * useful.
 *
 * This was wrong, and the dashboard caught it: 401/403 were recorded as free on
 * the theory that a rejected key does no work. RentCast counts them anyway.
 * Three requests reached them while the app reported one, and an undercount is
 * the dangerous direction — it reads as headroom that is not there.
 *
 * So the rule is now about reaching them, not about succeeding:
 *
 *   billable       any attempted call: 2xx, 4xx, 5xx, and a network error
 *                  (which may have been served before the connection broke)
 *   not billable   refused locally before any socket opened: no key, the
 *                  monthly cap, a cache hit, a lock already held, mock mode
 *
 * When in doubt, count it. Over-reporting costs headroom; under-reporting
 * costs a cut-off mid-screening with no warning.
 */

export type RentCastMode = "live" | "mock";

/**
 * Whether this deployment may spend real requests.
 *
 * Production calls RentCast. Everything else — local, preview, CI, tests —
 * serves fixtures, because a preview deploy quietly eating the month's quota is
 * a cost nobody notices until screening stops working. `RENTCAST_MODE` forces
 * either way, so a deliberate live check from local is still possible.
 *
 * Fails safe: anything other than an explicit live signal is mock.
 */
export function rentCastMode(): RentCastMode {
  const explicit = process.env.RENTCAST_MODE?.toLowerCase();
  if (explicit === "mock") return "mock";
  if (explicit === "live") return "live";

  // Vercel sets VERCEL_ENV to production | preview | development.
  if (process.env.VERCEL_ENV === "production") return "live";
  if (process.env.VERCEL_ENV) return "mock";

  // Not on Vercel at all: local or CI.
  return "mock";
}

export function hasApiKey(): boolean {
  return Boolean(process.env.RENTCAST_API_KEY);
}

/**
 * The fixture, restamped with the address that was asked for.
 *
 * The addresses matter: the caller caches on normalized address, so a mock that
 * always claimed to be 128 Maple St would make every house in a test collapse
 * onto one cache entry and hide exactly the bug this work exists to prevent.
 * The comps and the subject facts stay as they are — they are the realistic
 * part, and tests assert against their numbers.
 */
function mockResponse(address: string): RentCastValueResponse {
  const base = fixture as unknown as RentCastValueResponse;
  return {
    ...base,
    subjectProperty: { ...base.subjectProperty, formattedAddress: address },
  };
}

function clampCompCount(requested: number | undefined): number {
  if (requested === undefined) return COMP_COUNT_DEFAULT;
  return Math.min(COMP_COUNT_MAX, Math.max(COMP_COUNT_MIN, Math.round(requested)));
}

/**
 * Fetch a value estimate and its comparables.
 *
 * One call per house, not two. The response carries `subjectProperty` with
 * beds, baths, sqft, year built and the last sale, so the property's own facts
 * come back with the comps — there is no need for a second GET /properties, and
 * on a 50-request month that is the difference between 25 houses and 50.
 */
export async function fetchValueEstimate(
  params: ValueEstimateParams,
  signal?: AbortSignal
): Promise<RentCastResult> {
  const mode = rentCastMode();

  // Fixtures outside production. No socket opens, so nothing is billed.
  if (mode === "mock") {
    return {
      ok: true,
      data: mockResponse(params.address),
      statusCode: 200,
      billable: false,
      mode,
    };
  }

  const apiKey = process.env.RENTCAST_API_KEY;

  // Refused locally, so it never counts against the quota.
  if (!apiKey) {
    return {
      ok: false,
      failure: "no_key",
      message: "No RentCast API key is configured.",
      statusCode: null,
      billable: false,
      mode,
    };
  }

  const query = new URLSearchParams({
    address: params.address,
    compCount: String(clampCompCount(params.compCount)),
    maxRadius: String(params.maxRadius ?? DEFAULT_MAX_RADIUS_MILES),
    daysOld: String(Math.max(1, Math.round(params.daysOld ?? DEFAULT_DAYS_OLD))),
  });

  // Hints that improve comp matching. Only sent when we actually know them —
  // a guessed sqft produces confidently wrong comps.
  if (params.propertyType) query.set("propertyType", params.propertyType);
  if (params.bedrooms !== undefined) query.set("bedrooms", String(params.bedrooms));
  if (params.bathrooms !== undefined) query.set("bathrooms", String(params.bathrooms));
  if (params.squareFootage !== undefined) query.set("squareFootage", String(params.squareFootage));

  let response: Response;
  try {
    response = await fetch(`${BASE}/avm/value?${query.toString()}`, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    return {
      ok: false,
      failure: "network_error",
      message: error instanceof Error ? error.message : "Network request failed.",
      statusCode: null,
      // Counted. The request left this process and may well have been served
      // before the connection broke; assuming otherwise undercounts.
      billable: true,
      mode,
    };
  }

  if (!response.ok) {
    return mapErrorResponse(response.status, await readErrorMessage(response), mode);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      failure: "bad_response",
      // Billable: the request reached RentCast and was served. Our inability to
      // parse it does not give the quota back.
      message: "RentCast returned a response that was not JSON.",
      statusCode: response.status,
      billable: true,
      mode,
    };
  }

  if (typeof data !== "object" || data === null) {
    return {
      ok: false,
      failure: "bad_response",
      message: "RentCast returned an unexpected response shape.",
      statusCode: response.status,
      billable: true,
      mode,
    };
  }

  return {
    ok: true,
    data: data as RentCastValueResponse,
    statusCode: response.status,
    billable: true,
    mode,
  };
}

function mapErrorResponse(
  statusCode: number,
  message: string,
  mode: RentCastMode
): RentCastResult {
  // 401/403 — the key is present but not working. Same user action as a missing
  // key (go fix it in Settings), so it reports as no_key rather than inventing
  // a state with no remedy attached.
  //
  // Billable, which is the correction: RentCast counts a rejected key against
  // the plan. Two of these were logged free while their dashboard counted them,
  // which is the whole reason our number read 1 against their 3.
  if (statusCode === 401 || statusCode === 403) {
    return {
      ok: false,
      failure: "no_key",
      message: message || "RentCast rejected the API key.",
      statusCode,
      billable: true,
      mode,
    };
  }

  // 404 — RentCast has no data for this address. A real answer, not a fault:
  // it means type the comps in by hand.
  if (statusCode === 404) {
    return {
      ok: false,
      failure: "not_found",
      message: message || "RentCast has no data for this address.",
      statusCode,
      // Billable: the lookup ran and found nothing.
      billable: true,
      mode,
    };
  }

  // 429 covers both "too fast" and "out of quota", and RentCast does not
  // distinguish them in the status alone. Neither produced an estimate, so
  // neither is counted — a usage figure that over-reports is one people stop
  // trusting and then stop looking at.
  if (statusCode === 429) {
    const isQuota = /quota|limit|exceed/i.test(message);
    return {
      ok: false,
      failure: isQuota ? "quota" : "rate_limited",
      message: message || "RentCast rate limit reached.",
      statusCode,
      // Counted. A 429 reached RentCast, and whether they bill it is their
      // call, not ours to assume away.
      billable: true,
      mode,
    };
  }

  return {
    ok: false,
    failure: "http_error",
    message: message || `RentCast returned ${statusCode}.`,
    statusCode,
    billable: true,
    mode,
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const record = body as Record<string, unknown>;
      for (const key of ["message", "error", "detail"]) {
        if (typeof record[key] === "string") return record[key] as string;
      }
    }
  } catch {
    // A non-JSON error body is normal for a gateway failure. The status code
    // already carries the useful part.
  }
  return "";
}
