-- Recorded sales as comps.
--
-- WRITTEN, NOT RUN. Nothing in this file has been applied to any database.
--
-- Comps now come from GET /properties, which returns closed sale prices from
-- public records, instead of GET /avm/value, which returns listings. A listing
-- is what somebody hoped for; a deed is what somebody paid.
--
-- Three separate changes, in order of how much they matter:
--
--   1. a `public_record` source, so a county record can assert a sale without
--      weakening the rule that a listing never can
--   2. who bought it, so a sale that looks like an investor pickup can be
--      flagged on screen rather than silently moving an ARV
--   3. the request cache and the in-flight lock become per endpoint, which
--      they always should have been

-- ── 1. A third source ────────────────────────────────────────────────────────
--
-- `status = 'sold'` has only ever been reachable from `source = 'manual'`,
-- because only a person could confirm a sale. A county record is proof in
-- exactly the way a listing is not, so it earns its own source rather than
-- borrowing 'manual' and pretending a person typed it.
--
-- The rule itself does not change: RentCast's own listing data can still never
-- claim a sale. The constraint is renamed only because `sold_is_manual` would
-- no longer describe what it enforces.
--
-- NOTE: `property_comps_source_check` is PostgreSQL's auto-generated name for
-- the inline CHECK in the original table definition. Confirm it with
-- `\d property_comps` before running this; if the name differs, fix it here
-- rather than guessing.

ALTER TABLE property_comps DROP CONSTRAINT property_comps_source_check;

ALTER TABLE property_comps ADD CONSTRAINT property_comps_source_check
  CHECK (source IN ('rentcast', 'manual', 'public_record'));

ALTER TABLE property_comps DROP CONSTRAINT property_comps_sold_is_manual;

ALTER TABLE property_comps ADD CONSTRAINT property_comps_sold_needs_proof
  CHECK (status <> 'sold' OR source IN ('manual', 'public_record'));

-- ── 2. Who bought it ─────────────────────────────────────────────────────────
--
-- RentCast's property records carry the current owner. A house bought by a
-- company, or bought well below what the street fetches, may have been a
-- fixer-upper — in which case its price is not what a finished house is worth.
--
-- Flagged on screen, never excluded here. The comp stays ticked and the owner
-- decides; a filter that silently drops cheap sales would quietly raise every
-- ARV in the system.
--
-- `buyer_type`, NOT `owner_type`. The table already has an `owner_type` column
-- meaning 'personal' | 'team' — the tenancy owner. Reusing that name here
-- would collide with every owner filter in compService.ts.

ALTER TABLE property_comps
  ADD COLUMN IF NOT EXISTS buyer_type text
    CHECK (buyer_type IS NULL OR buyer_type IN ('Individual', 'Organization')),
  ADD COLUMN IF NOT EXISTS buyer_name text,
  ADD COLUMN IF NOT EXISTS county     text;

COMMENT ON COLUMN property_comps.buyer_type IS
  'Who bought this comp, per public records: Individual or Organization. Not the tenancy owner — that is owner_type.';

-- ── 3. The cache and the lock become per endpoint ────────────────────────────
--
-- Both were keyed on (owner, normalized_address) with no endpoint, from when
-- /avm/value was the only endpoint there was.
--
-- The bug that exposes: a house with an /avm/value response from last week
-- would have that response returned as the cache hit for its first
-- /properties pull, and the in-flight lock would refuse the two endpoints
-- concurrently for one address. A house could never make its first recorded-
-- sales lookup until the 30-day window on its old listing response expired.

DROP INDEX IF EXISTS rentcast_requests_one_in_flight;

CREATE UNIQUE INDEX IF NOT EXISTS rentcast_requests_one_in_flight
  ON rentcast_requests (owner_type, owner_id, endpoint, normalized_address)
  WHERE state = 'in_flight' AND normalized_address IS NOT NULL;

DROP INDEX IF EXISTS rentcast_requests_cache_idx;

CREATE INDEX IF NOT EXISTS rentcast_requests_cache_idx
  ON rentcast_requests (owner_type, owner_id, endpoint, normalized_address, requested_at DESC)
  WHERE state = 'succeeded' AND response_body IS NOT NULL;

-- ── Down ─────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS rentcast_requests_cache_idx;
-- CREATE INDEX rentcast_requests_cache_idx
--   ON rentcast_requests (owner_type, owner_id, normalized_address, requested_at DESC)
--   WHERE state = 'succeeded' AND response_body IS NOT NULL;
-- DROP INDEX IF EXISTS rentcast_requests_one_in_flight;
-- CREATE UNIQUE INDEX rentcast_requests_one_in_flight
--   ON rentcast_requests (owner_type, owner_id, normalized_address)
--   WHERE state = 'in_flight' AND normalized_address IS NOT NULL;
-- ALTER TABLE property_comps DROP COLUMN IF EXISTS county, DROP COLUMN IF EXISTS buyer_name, DROP COLUMN IF EXISTS buyer_type;
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_sold_needs_proof;
-- ALTER TABLE property_comps ADD CONSTRAINT property_comps_sold_is_manual CHECK (status <> 'sold' OR source = 'manual');
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_source_check;
-- ALTER TABLE property_comps ADD CONSTRAINT property_comps_source_check CHECK (source IN ('rentcast', 'manual'));
