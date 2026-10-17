-- Copy saved mortgage scenarios into `analyses`, with their version history.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THIS ONE WRITES DATA. The two before it only changed shape.
--
-- The old tables are left in place and untouched. Nothing reads them after
-- this, but they stay as the fallback until the copy has been verified and the
-- drop separately approved — that is migration 6, and it is not this.
--
-- Idempotent: re-running copies nothing, because every insert skips rows whose
-- id already exists in the destination. The analysis keeps the scenario's id,
-- which is what makes that check possible and keeps saved links working.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The scenarios ─────────────────────────────────────────────────────────
-- property_id stays NULL. There is nothing to attach them to: these were saved
-- under a free-text name, before a house was part of the model. They surface
-- under "Unassigned" with an action to attach an address.

INSERT INTO analyses (
  id, owner_type, owner_id, property_id,
  kind, label, is_primary,
  inputs, inputs_version, profile_snapshot, version,
  archived_at, created_by, created_at, updated_at
)
SELECT
  s.id,
  s.owner_type,
  s.owner_id,
  NULL,                       -- no house known
  'financing',
  s.label,
  false,                      -- primary is meaningless without a property
  s.inputs,
  s.inputs_version,
  s.profile_snapshot,         -- from Phase 0; null for anything saved before it
  s.version,
  s.deleted_at,               -- the old table's soft delete maps to archived_at
  s.created_by,
  s.created_at,
  s.updated_at
FROM mortgage_scenarios s
WHERE NOT EXISTS (SELECT 1 FROM analyses a WHERE a.id = s.id);

-- ── 2. Their versions ────────────────────────────────────────────────────────
-- Copied with their own ids, for the same idempotence reason.
--
-- The trigger added in the previous migration fires on UPDATE, not INSERT, so
-- this does not generate spurious versions while copying.

INSERT INTO analysis_versions (
  id, analysis_id, version, label, kind, property_id,
  inputs, inputs_version, superseded_by, superseded_at
)
SELECT
  v.id,
  v.scenario_id,
  v.version,
  v.label,
  'financing',
  NULL,
  v.inputs,
  v.inputs_version,
  v.superseded_by,
  v.superseded_at
FROM mortgage_scenario_versions v
WHERE EXISTS (SELECT 1 FROM analyses a WHERE a.id = v.scenario_id)
  AND NOT EXISTS (SELECT 1 FROM analysis_versions av WHERE av.id = v.id);

-- ── 3. Verify, loudly ────────────────────────────────────────────────────────
-- Raises rather than returning a row, so a mismatch stops the migration instead
-- of being something a human has to notice afterwards.

DO $$
DECLARE
  old_scenarios integer;
  new_analyses  integer;
  old_versions  integer;
  new_versions  integer;
BEGIN
  SELECT count(*) INTO old_scenarios FROM mortgage_scenarios;
  SELECT count(*) INTO new_analyses  FROM analyses WHERE kind = 'financing';
  SELECT count(*) INTO old_versions  FROM mortgage_scenario_versions;
  SELECT count(*) INTO new_versions  FROM analysis_versions;

  RAISE NOTICE 'scenarios % -> analyses %, versions % -> %',
    old_scenarios, new_analyses, old_versions, new_versions;

  IF new_analyses < old_scenarios THEN
    RAISE EXCEPTION 'copy incomplete: % scenarios but only % analyses',
      old_scenarios, new_analyses;
  END IF;

  IF new_versions < old_versions THEN
    RAISE EXCEPTION 'version copy incomplete: % versions but only % copied',
      old_versions, new_versions;
  END IF;
END $$;
