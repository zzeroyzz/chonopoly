-- What a removed listing actually sold for.
--
-- WRITTEN, NOT RUN. Nothing here has been applied to any database.
--
-- A removed listing has two prices and they are not the same fact. The listing
-- price is what the seller wanted; the sale price is what somebody paid. The
-- app has only ever stored the first, so approving a removed comp meant
-- feeding an asking price into the ARV and calling it evidence.
--
-- Now the owner can say what it sold for, in its own columns. `price` keeps
-- meaning the listed price and is never overwritten, so the card can show
-- both: "Listed at $348,560 · Sold for $335,000".

BEGIN;

CREATE TEMP TABLE _sale_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM property_comps) AS comps_before,
  (SELECT count(*) FROM property_comps WHERE review <> 'needs_review') AS reviewed_before;

-- ── 1. A fifth review state, for removed listings only ──────────────────────
--
-- "Took off market" is a real outcome and a different one from "not
-- renovated": the seller gave up, which says something about the price rather
-- than the house. Arithmetically it skips like the others; it is kept apart
-- for the same reason the other two are.
--
-- The CHECK is looked up by definition rather than by name, for the same
-- reason as the last migration: an inline CHECK's name is generated, and
-- guessing it wrong fails the migration for no good reason.

DO $$
DECLARE
  review_constraint text;
BEGIN
  SELECT conname INTO review_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.property_comps'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%needs_review%'
    AND pg_get_constraintdef(oid) ILIKE '%renovated_use%';

  RAISE NOTICE 'review CHECK found as: %', COALESCE(review_constraint, '(none)');

  IF review_constraint IS NULL THEN
    RAISE EXCEPTION 'No review CHECK found on property_comps. Nothing changed.';
  END IF;

  EXECUTE format('ALTER TABLE property_comps DROP CONSTRAINT %I', review_constraint);
END $$;

ALTER TABLE property_comps ADD CONSTRAINT property_comps_review_check
  CHECK (review IN (
    'needs_review',
    'renovated_use',
    'not_renovated_skip',
    'took_off_market_skip',
    'not_comparable_skip'
  ));

-- ── 2. The sale price, beside the listing price ─────────────────────────────

ALTER TABLE property_comps
  ADD COLUMN IF NOT EXISTS sale_price numeric
    CHECK (sale_price IS NULL OR sale_price > 0),
  ADD COLUMN IF NOT EXISTS sale_date date;

COMMENT ON COLUMN property_comps.sale_price IS
  'What the owner says it sold for. The ARV uses this in preference to price. Never written by any automatic path.';
COMMENT ON COLUMN property_comps.price IS
  'The listed price, from RentCast or public records. Never overwritten by a sale price the owner enters.';

-- Approving a removed listing is a claim that it sold, so it needs the figure
-- it sold for. Enforced here rather than trusted to the form: a removed comp
-- approved with no sale price would silently put an asking price into the ARV,
-- which is the exact thing this migration exists to prevent.
ALTER TABLE property_comps ADD CONSTRAINT property_comps_removed_sale_needs_price
  CHECK (
    NOT (status = 'removed' AND review = 'renovated_use')
    OR sale_price IS NOT NULL
  );

-- ── 3. Prove the end state, or roll it all back ─────────────────────────────

DO $$
DECLARE
  missing   text;
  baseline  record;
  comps_now bigint;
BEGIN
  SELECT * INTO baseline FROM _sale_baseline;

  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY['sale_price', 'sale_date']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_comps' AND column_name = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing columns after migration: %', missing;
  END IF;

  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY[
    'property_comps_review_check',
    'property_comps_removed_sale_needs_price'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_comps'::regclass AND conname = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing constraints after migration: %', missing;
  END IF;

  SELECT count(*) INTO comps_now FROM property_comps;
  IF comps_now <> baseline.comps_before THEN
    RAISE EXCEPTION 'property_comps row count changed: % -> %', baseline.comps_before, comps_now;
  END IF;

  -- No review may be disturbed by a schema change.
  IF (SELECT count(*) FROM property_comps WHERE review <> 'needs_review')
     <> baseline.reviewed_before THEN
    RAISE EXCEPTION 'Review states changed during the migration.';
  END IF;

  RAISE NOTICE 'VERIFIED: 2 columns, 2 constraints, % comps, reviews untouched.', comps_now;
END $$;

COMMIT;

-- ── Down ─────────────────────────────────────────────────────────────────────
-- BEGIN;
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_removed_sale_needs_price;
-- ALTER TABLE property_comps DROP COLUMN IF EXISTS sale_date;
-- ALTER TABLE property_comps DROP COLUMN IF EXISTS sale_price;
-- UPDATE property_comps SET review = 'not_comparable_skip' WHERE review = 'took_off_market_skip';
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_review_check;
-- ALTER TABLE property_comps ADD CONSTRAINT property_comps_review_check
--   CHECK (review IN ('needs_review','renovated_use','not_renovated_skip','not_comparable_skip'));
-- COMMIT;
