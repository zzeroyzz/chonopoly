-- Recorded sales as comps.
--
-- Comps now come from GET /properties, which returns closed sale prices from
-- public records, instead of GET /avm/value, which returns listings. A listing
-- is what somebody hoped for; a deed is what somebody paid.
--
-- Four changes:
--
--   1. a `public_record` source, so a county record can assert a sale without
--      weakening the rule that a listing never can
--   2. a sale from public records must carry a price above zero
--   3. who bought it, so a sale that looks like an investor pickup can be
--      flagged on screen rather than silently moving an ARV
--   4. the request cache and the in-flight lock become per endpoint, which
--      they always should have been
--
-- Wrapped in a single transaction. Every statement below either all applies
-- or none of it does, and the assertions at the bottom make "none of it" the
-- outcome if the end state is not exactly what was intended.
--
-- The two CHECK constraints being replaced are looked up by DEFINITION rather
-- than by name. `property_comps_source_check` is PostgreSQL's auto-generated
-- name for an inline CHECK and is not guaranteed; guessing it wrong would
-- fail the migration for a reason that has nothing to do with the change.

BEGIN;

-- ── 0. Remember where we started, so nothing can quietly vanish ─────────────

CREATE TEMP TABLE _migration_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM property_comps)    AS comps_before,
  (SELECT count(*) FROM rentcast_requests) AS requests_before;

-- ── 1. A third source ───────────────────────────────────────────────────────
--
-- `status = 'sold'` has only ever been reachable from `source = 'manual'`,
-- because only a person could confirm a sale. A county record is proof in
-- exactly the way a listing is not, so it earns its own source rather than
-- borrowing 'manual' and pretending a person typed it.
--
-- The rule itself does not change: RentCast's own listing data can still
-- never claim a sale.

DO $$
DECLARE
  source_constraint text;
  sold_constraint   text;
BEGIN
  SELECT conname INTO source_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.property_comps'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%source%rentcast%manual%';

  SELECT conname INTO sold_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.property_comps'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%sold%'
    AND pg_get_constraintdef(oid) ILIKE '%manual%'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  RAISE NOTICE 'source CHECK found as: %', COALESCE(source_constraint, '(none)');
  RAISE NOTICE 'sold CHECK found as:   %', COALESCE(sold_constraint, '(none)');

  IF source_constraint IS NULL THEN
    RAISE EXCEPTION 'No source CHECK found on property_comps. Nothing changed.';
  END IF;
  IF sold_constraint IS NULL THEN
    RAISE EXCEPTION 'No sold-is-manual CHECK found on property_comps. Nothing changed.';
  END IF;

  EXECUTE format('ALTER TABLE property_comps DROP CONSTRAINT %I', source_constraint);
  EXECUTE format('ALTER TABLE property_comps DROP CONSTRAINT %I', sold_constraint);
END $$;

ALTER TABLE property_comps ADD CONSTRAINT property_comps_source_check
  CHECK (source IN ('rentcast', 'manual', 'public_record'));

ALTER TABLE property_comps ADD CONSTRAINT property_comps_sold_needs_proof
  CHECK (status <> 'sold' OR source IN ('manual', 'public_record'));

-- ── 2. A county sale must have a price ──────────────────────────────────────
--
-- A public record with no price cannot move an ARV, and a zero posing as a
-- sale price would drag a median toward nothing while looking like evidence.
-- The mapper already drops these; this makes it impossible to store one.

ALTER TABLE property_comps ADD CONSTRAINT property_comps_public_record_has_price
  CHECK (source <> 'public_record' OR (price IS NOT NULL AND price > 0));

-- ── 3. Who bought it ────────────────────────────────────────────────────────
--
-- A house bought by a company, or bought well below what the street fetches,
-- may have been a fixer-upper — in which case its price is not what a
-- finished house is worth. Flagged on screen, never excluded here.
--
-- `buyer_type`, NOT `owner_type`. The table already has an `owner_type`
-- column meaning 'personal' | 'team' — the tenancy owner. Reusing that name
-- would collide with every owner filter in compService.ts.

ALTER TABLE property_comps
  ADD COLUMN IF NOT EXISTS buyer_type text
    CHECK (buyer_type IS NULL OR buyer_type IN ('Individual', 'Organization')),
  ADD COLUMN IF NOT EXISTS buyer_name text,
  ADD COLUMN IF NOT EXISTS county     text;

COMMENT ON COLUMN property_comps.buyer_type IS
  'Who bought this comp, per public records: Individual or Organization. Not the tenancy owner — that is owner_type.';

-- ── 4. The cache and the lock become per endpoint ───────────────────────────
--
-- Both were keyed on (owner, normalized_address) with no endpoint, from when
-- /avm/value was the only endpoint there was.
--
-- The bug that exposes: a house with an /avm/value response from last week
-- would have that response returned as the cache hit for its first
-- /properties pull, and the in-flight lock would refuse the two endpoints
-- concurrently for one address. A house could never make its first
-- recorded-sales lookup until the 30-day window on its old response expired.

DROP INDEX IF EXISTS rentcast_requests_one_in_flight;

CREATE UNIQUE INDEX rentcast_requests_one_in_flight
  ON rentcast_requests (owner_type, owner_id, endpoint, normalized_address)
  WHERE state = 'in_flight' AND normalized_address IS NOT NULL;

DROP INDEX IF EXISTS rentcast_requests_cache_idx;

CREATE INDEX rentcast_requests_cache_idx
  ON rentcast_requests (owner_type, owner_id, endpoint, normalized_address, requested_at DESC)
  WHERE state = 'succeeded' AND response_body IS NOT NULL;

-- ── 5. Prove the end state, or roll the whole thing back ────────────────────

DO $$
DECLARE
  missing text;
  comps_now    bigint;
  requests_now bigint;
  baseline     record;
BEGIN
  SELECT * INTO baseline FROM _migration_baseline;

  -- Columns.
  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY['buyer_type', 'buyer_name', 'county']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_comps' AND column_name = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing columns after migration: %', missing;
  END IF;

  -- Constraints.
  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY[
    'property_comps_source_check',
    'property_comps_sold_needs_proof',
    'property_comps_public_record_has_price'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_comps'::regclass AND conname = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing constraints after migration: %', missing;
  END IF;

  -- Both indexes, and both must now include the endpoint column.
  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY['rentcast_requests_one_in_flight', 'rentcast_requests_cache_idx']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = c AND indexdef LIKE '%endpoint%'
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Index missing or not keyed on endpoint: %', missing;
  END IF;

  -- Nothing was supposed to touch a single row.
  SELECT count(*) INTO comps_now    FROM property_comps;
  SELECT count(*) INTO requests_now FROM rentcast_requests;

  IF comps_now <> baseline.comps_before THEN
    RAISE EXCEPTION 'property_comps row count changed: % -> %', baseline.comps_before, comps_now;
  END IF;
  IF requests_now <> baseline.requests_before THEN
    RAISE EXCEPTION 'rentcast_requests row count changed: % -> %', baseline.requests_before, requests_now;
  END IF;

  RAISE NOTICE 'VERIFIED: 3 columns, 3 constraints, 2 endpoint-keyed indexes.';
  RAISE NOTICE 'VERIFIED: property_comps still % rows, rentcast_requests still % rows.',
    comps_now, requests_now;
END $$;

COMMIT;

-- ── Down ─────────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP INDEX IF EXISTS rentcast_requests_cache_idx;
-- CREATE INDEX rentcast_requests_cache_idx
--   ON rentcast_requests (owner_type, owner_id, normalized_address, requested_at DESC)
--   WHERE state = 'succeeded' AND response_body IS NOT NULL;
-- DROP INDEX IF EXISTS rentcast_requests_one_in_flight;
-- CREATE UNIQUE INDEX rentcast_requests_one_in_flight
--   ON rentcast_requests (owner_type, owner_id, normalized_address)
--   WHERE state = 'in_flight' AND normalized_address IS NOT NULL;
-- ALTER TABLE property_comps DROP COLUMN IF EXISTS county;
-- ALTER TABLE property_comps DROP COLUMN IF EXISTS buyer_name;
-- ALTER TABLE property_comps DROP COLUMN IF EXISTS buyer_type;
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_public_record_has_price;
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_sold_needs_proof;
-- ALTER TABLE property_comps ADD CONSTRAINT property_comps_sold_is_manual
--   CHECK (status <> 'sold' OR source = 'manual');
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_source_check;
-- ALTER TABLE property_comps ADD CONSTRAINT property_comps_source_check
--   CHECK (source IN ('rentcast', 'manual'));
-- COMMIT;
