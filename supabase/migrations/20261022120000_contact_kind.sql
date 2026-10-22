-- A contact can be a company, and say so.
--
-- APPLIED 2026-10-22 via `supabase db push` on the owner's instruction.
--
-- One migration was pending and history was in sync before the push, so this
-- is the only thing that ran. The verify block below passed: the row count was
-- unchanged and exactly the nameless-company rows were relabelled.
--
-- This line read "WRITTEN, NOT RUN" until the moment it was applied and was
-- changed in the same breath. A stale banner is worse than no banner, because
-- it is believed — which is what the two comps migrations before
-- 20261021000000 taught.
--
-- `contacts.company` already exists, and the CRM migration says why:
--
--   "Entity-owned property is common; the LLC is the owner, not a person."
--
-- So the schema already knew companies existed. What it could not say is
-- whether a row IS one. A contact with `company` set may be Dana Whitfield who
-- works at an agency, or it may be Ground Floor LLC. Guessing from
-- "first_name IS NULL" works right up until somebody records a name against a
-- company, and then a lender quietly becomes a person in every list.
--
-- `website` comes along because a hard money lender's inventory lives on one,
-- and the owner reads it off this screen and types it into a browser.

BEGIN;

CREATE TEMP TABLE _contact_kind_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM contacts)                                    AS contacts_before,
  (SELECT count(*) FROM contacts WHERE company IS NOT NULL)          AS with_company_before,
  (SELECT count(*) FROM contacts
    WHERE first_name IS NULL AND last_name IS NULL
      AND company IS NOT NULL)                                       AS nameless_companies;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'person';

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS website text;

-- Added after the column, so the backfill below cannot be refused by it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contacts'::regclass
      AND conname = 'contacts_kind_check'
  ) THEN
    ALTER TABLE contacts ADD CONSTRAINT contacts_kind_check
      CHECK (kind IN ('person', 'company'));
  END IF;
END $$;

COMMENT ON COLUMN contacts.kind IS
  'person or company. A company holds a portfolio; a person is someone you ring.';
COMMENT ON COLUMN contacts.website IS
  'Where their inventory is listed, for a company.';

-- ── The backfill ────────────────────────────────────────────────────────────
--
-- Only rows that are already a company in all but name: a company recorded,
-- and nobody's name against it. A row with both is a person at a company and
-- is left alone, because calling it a company would lose the person.

UPDATE contacts
   SET kind = 'company'
 WHERE first_name IS NULL
   AND last_name IS NULL
   AND company IS NOT NULL
   AND kind = 'person';

-- Finding a company by name is the whole of the list screen.
CREATE INDEX IF NOT EXISTS contacts_company_idx
  ON contacts (owner_type, owner_id, kind, company);

-- ── Prove the end state, or roll it all back ────────────────────────────────

DO $$
DECLARE
  baseline     record;
  contacts_now bigint;
  companies    bigint;
BEGIN
  SELECT * INTO baseline FROM _contact_kind_baseline;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'kind'
  ) THEN
    RAISE EXCEPTION 'contacts.kind is missing after the migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'website'
  ) THEN
    RAISE EXCEPTION 'contacts.website is missing after the migration.';
  END IF;

  -- Nothing here creates or destroys a contact.
  SELECT count(*) INTO contacts_now FROM contacts;
  IF contacts_now <> baseline.contacts_before THEN
    RAISE EXCEPTION 'contacts row count changed: % -> %', baseline.contacts_before, contacts_now;
  END IF;

  -- Exactly the nameless-company rows were relabelled, and no others.
  SELECT count(*) INTO companies FROM contacts WHERE kind = 'company';
  IF companies <> baseline.nameless_companies THEN
    RAISE EXCEPTION
      'Expected % companies after the backfill, found %.',
      baseline.nameless_companies, companies;
  END IF;

  IF (SELECT count(*) FROM contacts WHERE company IS NOT NULL)
     <> baseline.with_company_before THEN
    RAISE EXCEPTION 'The company column changed during the migration.';
  END IF;

  RAISE NOTICE 'VERIFIED: % contacts, % now marked company, nothing created or destroyed.',
    contacts_now, companies;
END $$;

COMMIT;

-- ── Down ─────────────────────────────────────────────────────────────────────
--
-- Dropping `kind` loses which rows you had marked as companies, and `website`
-- is the only copy of what was typed there. Read both out first if it matters.
--
-- BEGIN;
-- ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_kind_check;
-- DROP INDEX IF EXISTS contacts_company_idx;
-- ALTER TABLE contacts DROP COLUMN IF EXISTS website;
-- ALTER TABLE contacts DROP COLUMN IF EXISTS kind;
-- COMMIT;
