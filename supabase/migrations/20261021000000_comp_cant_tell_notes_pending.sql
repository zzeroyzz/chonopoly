-- When you cannot tell, say so. Plus somewhere to write it down, and Pending.
--
-- WRITTEN, NOT RUN. Nothing here has been applied to any database.
--
-- ⚠ WHOEVER RUNS THIS: change the line above in the same breath. The last two
-- comps migrations carried it long after they had been applied, and work was
-- later planned around columns that were assumed absent and were not. A stale
-- banner is worse than no banner, because it is believed.
--
-- Three gaps and one accident:
--
--   1. A removed listing often takes its photos down with it, and the review
--      then forces a guess between "it counts" and "leave it out". Both move
--      the resale price on no evidence. `cant_tell_skip` is the honest answer.
--
--   2. There was nowhere to write down what you saw. `notes` is taken: the
--      comp card reads it as the listing URL on hand-entered comps, so review
--      notes get their own column rather than breaking that link.
--
--   3. An accepted offer had nowhere to go. `pending` is neither active nor
--      removed, and calling it either is wrong.
--
--   4. And Pending can only ever be set by a person. RentCast reports Active
--      or Inactive and nothing else, so a sync can never learn that a house
--      went under contract. The database says so, the same way it already
--      says only a person or a county record may claim a sale.
--
-- The four changes are ORDERED: the status CHECK must admit 'pending' before
-- the constraint that references it is added, or this fails on itself.

BEGIN;

CREATE TEMP TABLE _cant_tell_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM property_comps) AS comps_before,
  (SELECT count(*) FROM property_comps WHERE review <> 'needs_review') AS reviewed_before,
  (SELECT count(*) FROM property_comps WHERE status = 'sold') AS sold_before;

-- ── A guard, used by every lookup below ─────────────────────────────────────
--
-- `property_comps` now carries several CHECKs mentioning `status` or `review`,
-- and `SELECT … INTO` takes an arbitrary row when more than one matches. Each
-- lookup counts its matches and refuses unless there is exactly one, because
-- dropping the wrong constraint is the kind of mistake that commits quietly.

-- ── 1. A sixth review state ─────────────────────────────────────────────────
--
-- `cant_tell_skip` skips arithmetically, like the other three. It is kept
-- apart because it records a different judgement, and because it is the only
-- one the resale price has to mention out loud: four comps where two more were
-- unreadable is a different number from four out of six.

DO $$
DECLARE
  review_constraint text;
  matches           int;
BEGIN
  SELECT count(*), min(conname) INTO matches, review_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.property_comps'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%needs_review%'
    AND pg_get_constraintdef(oid) ILIKE '%renovated_use%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%sale_price%';

  IF matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 review CHECK, found %. Nothing changed.', matches;
  END IF;

  RAISE NOTICE 'review CHECK found as: %', review_constraint;
  EXECUTE format('ALTER TABLE property_comps DROP CONSTRAINT %I', review_constraint);
END $$;

ALTER TABLE property_comps ADD CONSTRAINT property_comps_review_check
  CHECK (review IN (
    'needs_review',
    'renovated_use',
    'not_renovated_skip',
    'took_off_market_skip',
    'not_comparable_skip',
    'cant_tell_skip'
  ));

-- ── 2. Somewhere to write down what you saw ─────────────────────────────────
--
-- Beside `notes`, never instead of it. `notes` carries the listing URL on a
-- hand-entered comp and the card reads it as one; writing review notes there
-- would break the link on exactly the comps somebody typed in by hand.

ALTER TABLE property_comps
  ADD COLUMN IF NOT EXISTS review_notes text;

COMMENT ON COLUMN property_comps.review_notes IS
  'What the owner saw when they reviewed this comp. Beside notes, which holds a hand-entered comp''s listing URL.';

-- ── 3. Pending as a status ──────────────────────────────────────────────────
--
-- Before change 4, which constrains it.

DO $$
DECLARE
  status_constraint text;
  matches           int;
BEGIN
  SELECT count(*), min(conname) INTO matches, status_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.property_comps'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%active%'
    AND pg_get_constraintdef(oid) ILIKE '%removed%'
    AND pg_get_constraintdef(oid) ILIKE '%sold%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%source%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%sale_price%';

  IF matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 status CHECK, found %. Nothing changed.', matches;
  END IF;

  RAISE NOTICE 'status CHECK found as: %', status_constraint;
  EXECUTE format('ALTER TABLE property_comps DROP CONSTRAINT %I', status_constraint);
END $$;

ALTER TABLE property_comps ADD CONSTRAINT property_comps_status_check
  CHECK (status IN ('active', 'pending', 'removed', 'sold'));

COMMENT ON COLUMN property_comps.status IS
  'What the market did. pending means an accepted offer that has not closed; it is never counted toward an ARV.';

-- ── 4. Pending needs evidence, the same as sold ─────────────────────────────
--
-- `property_comps_sold_needs_proof` already says only a person or a county
-- record may claim a sale. This is the same rule for the same reason: RentCast
-- cannot report an accepted offer, so anything claiming one came from a person.

ALTER TABLE property_comps ADD CONSTRAINT property_comps_pending_needs_proof
  CHECK (status <> 'pending' OR source IN ('manual', 'public_record'));

-- ── Prove the end state, or roll it all back ────────────────────────────────

DO $$
DECLARE
  baseline  record;
  comps_now bigint;
  missing   text;
BEGIN
  SELECT * INTO baseline FROM _cant_tell_baseline;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'property_comps'
      AND column_name = 'review_notes'
  ) THEN
    RAISE EXCEPTION 'review_notes is missing after the migration.';
  END IF;

  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY[
    'property_comps_review_check',
    'property_comps_status_check',
    'property_comps_pending_needs_proof'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_comps'::regclass AND conname = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing constraints after migration: %', missing;
  END IF;

  -- The new values are admitted, which is the whole point of the two swaps.
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.property_comps'::regclass
        AND conname = 'property_comps_review_check') NOT ILIKE '%cant_tell_skip%' THEN
    RAISE EXCEPTION 'The review CHECK does not admit cant_tell_skip.';
  END IF;

  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.property_comps'::regclass
        AND conname = 'property_comps_status_check') NOT ILIKE '%pending%' THEN
    RAISE EXCEPTION 'The status CHECK does not admit pending.';
  END IF;

  -- Nothing here rewrites a row. If any of these moved, something did.
  SELECT count(*) INTO comps_now FROM property_comps;
  IF comps_now <> baseline.comps_before THEN
    RAISE EXCEPTION 'property_comps row count changed: % -> %', baseline.comps_before, comps_now;
  END IF;

  IF (SELECT count(*) FROM property_comps WHERE review <> 'needs_review')
     <> baseline.reviewed_before THEN
    RAISE EXCEPTION 'Review states changed during the migration.';
  END IF;

  IF (SELECT count(*) FROM property_comps WHERE status = 'sold')
     <> baseline.sold_before THEN
    RAISE EXCEPTION 'Statuses changed during the migration.';
  END IF;

  RAISE NOTICE 'VERIFIED: 1 column, 3 constraints, % comps, nothing rewritten.', comps_now;
END $$;

COMMIT;

-- ── Down ─────────────────────────────────────────────────────────────────────
--
-- Reverting drops review_notes, which is the only copy of what anyone wrote.
-- Read it out first if it matters.
--
-- BEGIN;
-- UPDATE property_comps SET status = 'active' WHERE status = 'pending';
-- UPDATE property_comps SET review = 'not_comparable_skip' WHERE review = 'cant_tell_skip';
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_pending_needs_proof;
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_status_check;
-- ALTER TABLE property_comps ADD CONSTRAINT property_comps_status_check
--   CHECK (status IN ('active', 'removed', 'sold'));
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_review_check;
-- ALTER TABLE property_comps ADD CONSTRAINT property_comps_review_check
--   CHECK (review IN ('needs_review','renovated_use','not_renovated_skip','took_off_market_skip','not_comparable_skip'));
-- ALTER TABLE property_comps DROP COLUMN IF EXISTS review_notes;
-- COMMIT;
