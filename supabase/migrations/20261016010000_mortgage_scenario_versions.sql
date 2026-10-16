-- Version history and soft delete for saved mortgage scenarios.
--
-- Why: team members hold FOR ALL on mortgage_scenarios, so a teammate can
-- overwrite or delete your work. History makes an overwrite survivable; soft
-- delete makes a deletion survivable. Without the second, the first is only half
-- the protection — a hard delete would cascade the history away with the row.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Version counter and soft delete on the parent
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mortgage_scenarios
  ADD COLUMN IF NOT EXISTS version    integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- The label uniqueness index has to become partial.
--
-- Without this a soft-deleted scenario keeps its name reserved forever, and
-- saving a new one under that name fails with a constraint violation that looks
-- inexplicable weeks later.
DROP INDEX IF EXISTS mortgage_scenarios_owner_label_key;

CREATE UNIQUE INDEX IF NOT EXISTS mortgage_scenarios_owner_label_key
  ON mortgage_scenarios (owner_type, owner_id, lower(trim(label)))
  WHERE deleted_at IS NULL;

-- The list query only ever wants live rows.
CREATE INDEX IF NOT EXISTS mortgage_scenarios_owner_live_idx
  ON mortgage_scenarios (owner_type, owner_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The history
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per superseded state. Mirrors the shape of the parent rather than
-- storing a diff: a diff needs its base to mean anything, and a full snapshot
-- restores without replaying a chain.

CREATE TABLE IF NOT EXISTS mortgage_scenario_versions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id     uuid        NOT NULL REFERENCES mortgage_scenarios(id) ON DELETE CASCADE,

  -- The version number this row WAS, not the one that replaced it.
  version         integer     NOT NULL,

  label           text        NOT NULL,
  home_value      numeric     NOT NULL,
  loan_type       text        NOT NULL,
  monthly_payment numeric     NOT NULL,
  inputs          jsonb       NOT NULL,
  inputs_version  integer     NOT NULL,

  -- Who made the edit that replaced this state, and when.
  superseded_by   uuid,
  superseded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mortgage_scenario_versions_unique
  ON mortgage_scenario_versions (scenario_id, version);

CREATE INDEX IF NOT EXISTS mortgage_scenario_versions_scenario_idx
  ON mortgage_scenario_versions (scenario_id, superseded_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The trigger that writes it
-- ─────────────────────────────────────────────────────────────────────────────
-- In the database, not the service layer. Team members write directly under
-- FOR ALL, so anything enforced in application code can be bypassed by a route
-- that forgets to call it. This cannot be.
--
-- SECURITY DEFINER because users hold no write grant on the versions table —
-- history is written by the database or not at all.

CREATE OR REPLACE FUNCTION mortgage_scenarios_capture_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO mortgage_scenario_versions (
    scenario_id, version, label, home_value, loan_type,
    monthly_payment, inputs, inputs_version, superseded_by
  ) VALUES (
    OLD.id, OLD.version, OLD.label, OLD.home_value, OLD.loan_type,
    OLD.monthly_payment, OLD.inputs, OLD.inputs_version, auth.uid()
  );

  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mortgage_scenarios_capture_version ON mortgage_scenarios;

-- Only on a real content change. A soft delete, or a touch that changes nothing
-- a user typed, should not manufacture a version identical to the one before it.
CREATE TRIGGER mortgage_scenarios_capture_version
  BEFORE UPDATE ON mortgage_scenarios
  FOR EACH ROW
  WHEN (
    OLD.inputs          IS DISTINCT FROM NEW.inputs
    OR OLD.label        IS DISTINCT FROM NEW.label
    OR OLD.home_value   IS DISTINCT FROM NEW.home_value
    OR OLD.loan_type    IS DISTINCT FROM NEW.loan_type
  )
  EXECUTE FUNCTION mortgage_scenarios_capture_version();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Readable by anyone who can read the scenario it belongs to; that check is
-- delegated to the parent's own policies rather than restated here, so the two
-- cannot drift apart.
--
-- No INSERT, UPDATE or DELETE policy exists, deliberately. With RLS enabled and
-- no permissive policy for those commands, they are denied for every ordinary
-- caller — history is append-only, and only the SECURITY DEFINER trigger writes.

ALTER TABLE mortgage_scenario_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mortgage_scenario_versions: readable with its scenario"
  ON mortgage_scenario_versions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM mortgage_scenarios s WHERE s.id = scenario_id)
  );
