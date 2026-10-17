-- Reshape `analyses` into the spine for every kind of analysis on a house.
--
-- The table was built for the cash-flow tool and has never held a row. This
-- generalises it: a financing scenario, a rehab estimate, a flip and a rental
-- projection are all analyses OF a property, and they should live in one place
-- rather than in a table each.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DELIBERATELY DOES NOT DO: drop the ~37 legacy cash-flow columns.
--
-- They are all NOT NULL but all carry defaults, so a financing row inserts
-- without naming any of them. Only owner_type, owner_id, property_id and
-- created_by lack defaults. Dropping the rest would destroy a schema someone
-- designed for a tool that has not shipped, to buy nothing — the inserts work
-- either way. They stay until the cash-flow tool either uses them or is
-- abandoned, and that is a decision for whoever makes it, not a side effect of
-- this migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. property_id becomes optional ──────────────────────────────────────────
-- Quick math has to work before you know which house it is for. The save step
-- is where a house gets attached, so an analysis may legitimately have none.

ALTER TABLE analyses ALTER COLUMN property_id DROP NOT NULL;

-- And ON DELETE CASCADE becomes SET NULL. Deleting a property should not
-- silently destroy the analysis work done on it — the numbers outlive the lead.
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
  WHERE tc.table_name = 'analyses'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'property_id';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE analyses DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE analyses
  ADD CONSTRAINT analyses_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;

-- ── 2. What kind of analysis, and which one governs ──────────────────────────

ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'financing'
    CHECK (kind IN ('financing','rehab','flip','rental')),

  -- One primary financing scenario per house. The rehab check, the flip
  -- analysis and the compare view all read its price and reno budget, so
  -- "which scenario do the other tabs mean" needs one answer.
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,

  -- The inputs the analysis ran on, and what came out. One jsonb each rather
  -- than a column per field: the input shape changes, and this table already
  -- demonstrates where column-per-field leads.
  ADD COLUMN IF NOT EXISTS inputs jsonb,
  ADD COLUMN IF NOT EXISTS outputs jsonb,

  -- Profile and defaults as they were when this ran. Phase 0's badge reads it
  -- to say "your numbers changed since this" without re-running anything.
  ADD COLUMN IF NOT EXISTS profile_snapshot jsonb,

  -- Which shape `inputs` is in. A stored blob outlives the type that wrote it.
  ADD COLUMN IF NOT EXISTS inputs_version integer NOT NULL DEFAULT 1,

  -- Version counter, mirroring mortgage_scenarios.
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Soft delete reuses the existing `archived_at`. The table already had it;
-- adding `deleted_at` alongside would leave two with no rule about which wins.

-- ── 3. Indexes ───────────────────────────────────────────────────────────────

-- One name per house per kind. COALESCE because NULLs are distinct in a unique
-- index, so without it every unassigned analysis could reuse the same name and
-- the "Unassigned" list would fill with identical-looking rows.
CREATE UNIQUE INDEX IF NOT EXISTS analyses_owner_property_kind_label_key
  ON analyses (
    owner_type,
    owner_id,
    COALESCE(property_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind,
    lower(trim(label))
  )
  WHERE archived_at IS NULL;

-- At most one primary per house per kind.
CREATE UNIQUE INDEX IF NOT EXISTS analyses_one_primary_per_property
  ON analyses (property_id, kind)
  WHERE is_primary AND archived_at IS NULL AND property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analyses_owner_live_idx
  ON analyses (owner_type, owner_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS analyses_property_idx
  ON analyses (property_id) WHERE archived_at IS NULL;

-- ── 4. Version history ───────────────────────────────────────────────────────
-- Ported from mortgage_scenario_versions, including why it is a trigger: team
-- members write directly, so anything enforced in application code can be
-- bypassed by a route that forgets to call it.

CREATE TABLE IF NOT EXISTS analysis_versions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id    uuid        NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,

  -- The version this row WAS, not the one that replaced it.
  version        integer     NOT NULL,

  label          text        NOT NULL,
  kind           text        NOT NULL,
  property_id    uuid,
  inputs         jsonb,
  outputs        jsonb,
  profile_snapshot jsonb,
  inputs_version integer     NOT NULL DEFAULT 1,

  superseded_by  uuid,
  superseded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS analysis_versions_unique
  ON analysis_versions (analysis_id, version);

CREATE INDEX IF NOT EXISTS analysis_versions_analysis_idx
  ON analysis_versions (analysis_id, superseded_at DESC);

CREATE OR REPLACE FUNCTION analyses_capture_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO analysis_versions (
    analysis_id, version, label, kind, property_id,
    inputs, outputs, profile_snapshot, inputs_version, superseded_by
  ) VALUES (
    OLD.id, OLD.version, OLD.label, OLD.kind, OLD.property_id,
    OLD.inputs, OLD.outputs, OLD.profile_snapshot, OLD.inputs_version, auth.uid()
  );

  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS analyses_capture_version ON analyses;

-- Only on a real content change. Archiving, or attaching a house to an
-- unassigned save, should not manufacture a version identical to the one before.
CREATE TRIGGER analyses_capture_version
  BEFORE UPDATE ON analyses
  FOR EACH ROW
  WHEN (
    OLD.inputs IS DISTINCT FROM NEW.inputs
    OR OLD.label IS DISTINCT FROM NEW.label
  )
  EXECUTE FUNCTION analyses_capture_version();

-- ── 5. RLS on the versions table ─────────────────────────────────────────────
-- Readable with its analysis; the check is delegated to the parent's policies
-- rather than restated, so the two cannot drift apart. No INSERT/UPDATE/DELETE
-- policy exists: history is append-only and only the trigger writes it.

ALTER TABLE analysis_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analysis_versions: readable with its analysis"
  ON analysis_versions FOR SELECT
  USING (EXISTS (SELECT 1 FROM analyses a WHERE a.id = analysis_id));

-- ── Down ─────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS analyses_capture_version ON analyses;
-- DROP FUNCTION IF EXISTS analyses_capture_version();
-- DROP TABLE IF EXISTS analysis_versions;
-- DROP INDEX IF EXISTS analyses_owner_property_kind_label_key,
--                      analyses_one_primary_per_property,
--                      analyses_owner_live_idx, analyses_property_idx;
-- ALTER TABLE analyses DROP COLUMN IF EXISTS kind, DROP COLUMN IF EXISTS is_primary,
--   DROP COLUMN IF EXISTS inputs, DROP COLUMN IF EXISTS outputs,
--   DROP COLUMN IF EXISTS profile_snapshot, DROP COLUMN IF EXISTS inputs_version,
--   DROP COLUMN IF EXISTS version;
-- (property_id's NOT NULL and CASCADE are not restored — doing so would fail
--  against any row this migration made possible.)
