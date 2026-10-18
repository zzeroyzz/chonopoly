-- Make a RentCast request recoverable, cacheable, and impossible to duplicate.
--
-- Context: the free plan is 50 requests a month. The first live lookup spent
-- one, crashed after the response came back, and stored nothing — so the
-- request bought literally nothing and could not be retried without spending
-- another. Three requests reached RentCast while the app counted one.
--
-- The response body is the valuable part. Keeping it turns a crash from "spend
-- another request" into "parse the one we already paid for".

-- ── 1. Keep what we paid for ─────────────────────────────────────────────────

ALTER TABLE rentcast_requests
  -- The full response, stored BEFORE anything tries to parse it. This is what
  -- makes "rebuild from saved response" possible with no new call.
  ADD COLUMN IF NOT EXISTS response_body jsonb,

  -- The normalized address the request was for. Carried on the row rather than
  -- joined through property_id, because the cache has to hit across different
  -- property rows for the same house — which is exactly the case that burned a
  -- request here: two rows, "1653 sylvan rd sw" and "1653 sylvan rd św", are
  -- one house.
  ADD COLUMN IF NOT EXISTS normalized_address text,

  -- Request lifecycle. `in_flight` exists to be a lock; see the index below.
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'succeeded'
    CHECK (state IN ('in_flight', 'succeeded', 'failed')),

  ADD COLUMN IF NOT EXISTS completed_at timestamptz,

  -- Which address the caller asked for, before normalization. Kept for
  -- diagnosing a normalization bug without re-deriving it.
  ADD COLUMN IF NOT EXISTS requested_address text;

-- Existing rows predate the lifecycle column. They are all finished, so they
-- take their state from the outcome they already recorded.
UPDATE rentcast_requests
   SET state = CASE WHEN succeeded THEN 'succeeded' ELSE 'failed' END,
       completed_at = requested_at
 WHERE completed_at IS NULL;

-- ── 2. One call in flight per address ────────────────────────────────────────
--
-- The lock IS a row. A caller claims an address by inserting `in_flight`; a
-- second caller's insert violates this index and is told a call is already
-- running. This has to live in the database rather than in process memory:
-- the app runs as serverless functions, so two taps can land on two instances
-- that share no memory at all, and an in-process mutex would see nothing.
--
-- Scoped per owner, so one context cannot block another's lookups.

CREATE UNIQUE INDEX IF NOT EXISTS rentcast_requests_one_in_flight
  ON rentcast_requests (owner_type, owner_id, normalized_address)
  WHERE state = 'in_flight' AND normalized_address IS NOT NULL;

-- ── 3. The cache lookup ──────────────────────────────────────────────────────
-- "Has this address been fetched successfully in the last 30 days?" — the query
-- that runs before every call, and the one that has to be fast enough that
-- nobody is tempted to skip it.

CREATE INDEX IF NOT EXISTS rentcast_requests_cache_idx
  ON rentcast_requests (owner_type, owner_id, normalized_address, requested_at DESC)
  WHERE state = 'succeeded' AND response_body IS NOT NULL;

-- The monthly counter, which now includes every request that reached RentCast
-- rather than only the ones that returned usable data.
CREATE INDEX IF NOT EXISTS rentcast_requests_billable_month_idx
  ON rentcast_requests (owner_type, owner_id, requested_at DESC)
  WHERE billable;

-- ── Down ─────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS rentcast_requests_one_in_flight,
--                      rentcast_requests_cache_idx,
--                      rentcast_requests_billable_month_idx;
-- ALTER TABLE rentcast_requests
--   DROP COLUMN IF EXISTS response_body,
--   DROP COLUMN IF EXISTS normalized_address,
--   DROP COLUMN IF EXISTS state,
--   DROP COLUMN IF EXISTS completed_at,
--   DROP COLUMN IF EXISTS requested_address;
