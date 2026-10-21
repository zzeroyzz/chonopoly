-- The ARV is built from comps the owner approved.
--
-- APPLIED. Confirmed 2026-10-21.
--
-- This line read "WRITTEN, NOT RUN. Nothing here has been applied to any
-- database." for some time after the migration was in fact run, and nobody
-- updated it. That cost a planning round: work was designed around columns
-- that were assumed absent and were not. If you run a migration, change its
-- banner in the same breath.
--
-- Evidence it is applied: the columns below appear in
-- lib/supabase/database.types.ts, which is generated from the live schema,
-- and the ARV tab reads these review states at runtime.
--
-- The ARV moved four times without anyone touching it — 290 → 260 → 250 →
-- 219 — because the app kept deciding which comps were comparable and kept
-- getting better at it. Every move was defensible and the whole was useless:
-- a valuation that rewrites itself is a number nobody can stand behind.
--
-- So the decision moves to a person. `review` is the only thing the ARV
-- reads. Filters still run, but only to produce hints.

BEGIN;

CREATE TEMP TABLE _review_baseline ON COMMIT DROP AS
SELECT (SELECT count(*) FROM property_comps) AS comps_before;

-- ── The review state ────────────────────────────────────────────────────────
--
-- Four values, one per comp. Only 'renovated_use' counts toward the ARV.
--
-- The two skips are arithmetically identical and deliberately kept apart:
-- "not renovated" and "not comparable" are different judgements, and in six
-- months "why isn't this one in?" has two different answers.
--
-- DEFAULT 'needs_review' is doing real work. A comp inserted by a refresh
-- arrives unreviewed with no code required to remember it, which is the rule
-- that a refresh must never change a review.

ALTER TABLE property_comps
  ADD COLUMN IF NOT EXISTS review text NOT NULL DEFAULT 'needs_review'
    CHECK (review IN (
      'needs_review',
      'renovated_use',
      'not_renovated_skip',
      'not_comparable_skip'
    )),
  ADD COLUMN IF NOT EXISTS review_set_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS review_set_at timestamptz;

COMMENT ON COLUMN property_comps.review IS
  'Owner judgement. Only renovated_use counts toward the ARV; the app never sets this to anything but the needs_review default.';

-- Any state other than the default was set by a person, and we record who.
-- Same shape as the sold-needs-proof rule: a claim needs an author.
ALTER TABLE property_comps ADD CONSTRAINT property_comps_review_has_reviewer
  CHECK (review = 'needs_review' OR review_set_by IS NOT NULL);

-- Reading the list filtered to "Needs review" is the default screen, so it is
-- the one query that has to stay fast as a house collects eighty comps.
CREATE INDEX IF NOT EXISTS property_comps_review_idx
  ON property_comps (property_id, review);

-- ── `included` is kept, and stops being read ────────────────────────────────
--
-- Not dropped. It holds the only record of what was ticked under the old
-- design, dropping a column is irreversible, and the ARV simply stops
-- consulting it. Removing it is a separate decision once nobody wants that
-- history back.

COMMENT ON COLUMN property_comps.included IS
  'DEAD as of the review migration. The ARV reads property_comps.review instead. Kept only as a record of the old tick state.';

-- ── Prove the end state, or roll it all back ────────────────────────────────

DO $$
DECLARE
  missing      text;
  comps_now    bigint;
  baseline     record;
  unreviewed   bigint;
BEGIN
  SELECT * INTO baseline FROM _review_baseline;

  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY['review', 'review_set_by', 'review_set_at']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_comps' AND column_name = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing columns after migration: %', missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_comps'::regclass
      AND conname = 'property_comps_review_has_reviewer'
  ) THEN
    RAISE EXCEPTION 'The reviewer constraint is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'property_comps_review_idx'
  ) THEN
    RAISE EXCEPTION 'The review index is missing.';
  END IF;

  SELECT count(*) INTO comps_now FROM property_comps;
  IF comps_now <> baseline.comps_before THEN
    RAISE EXCEPTION 'property_comps row count changed: % -> %', baseline.comps_before, comps_now;
  END IF;

  -- Every existing comp lands on the default, which is the intended state:
  -- nothing is approved until a person approves it.
  SELECT count(*) INTO unreviewed FROM property_comps WHERE review = 'needs_review';
  IF unreviewed <> comps_now THEN
    RAISE EXCEPTION 'Expected every comp to start needs_review, got % of %', unreviewed, comps_now;
  END IF;

  RAISE NOTICE 'VERIFIED: 3 columns, 1 constraint, 1 index.';
  RAISE NOTICE 'VERIFIED: % comps, all needs_review, row count unchanged.', comps_now;
END $$;

COMMIT;

-- ── Down ─────────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP INDEX IF EXISTS property_comps_review_idx;
-- ALTER TABLE property_comps DROP CONSTRAINT property_comps_review_has_reviewer;
-- ALTER TABLE property_comps DROP COLUMN IF EXISTS review_set_at;
-- ALTER TABLE property_comps DROP COLUMN IF EXISTS review_set_by;
-- ALTER TABLE property_comps DROP COLUMN IF EXISTS review;
-- COMMENT ON COLUMN property_comps.included IS NULL;
-- COMMIT;
