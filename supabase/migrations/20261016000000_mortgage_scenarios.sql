-- Saved mortgage scenarios.
--
-- Run the numbers on a house, name it, come back to it. The calculator keeps a
-- single working draft in localStorage; this is the deliberate, named save that
-- survives the device.
--
-- Owner scoping is owner_type / owner_id per resolveContext, same as every other
-- table.
--
-- Deliberate divergence, recorded: team members can EDIT and DELETE shared
-- scenarios here, where pipeline_entries, contacts and budgets give teams read
-- access only. This was the owner's explicit choice. There is no history table,
-- so an overwrite by a teammate is not recoverable.

-- ─────────────────────────────────────────────────────────────────────────────
-- mortgage_scenarios
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mortgage_scenarios (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type      text        NOT NULL CHECK (owner_type IN ('personal','team')),
  owner_id        uuid        NOT NULL,

  label           text        NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),

  -- Denormalised so the list renders without parsing every blob. These are a
  -- cache of what's inside `inputs`, not a second source of truth.
  home_value      numeric     NOT NULL CHECK (home_value >= 0),
  loan_type       text        NOT NULL,
  monthly_payment numeric     NOT NULL CHECK (monthly_payment >= 0),

  -- The whole MortgageInputs object.
  --
  -- One jsonb column rather than a column per field, because the input shape
  -- changes: this branch alone renamed dpaAmount to dpaEnabled. Column-per-field
  -- turns every such rename into a schema migration, which is how the unused
  -- `analyses` table ended up with forty of them.
  inputs          jsonb       NOT NULL,

  -- Which shape `inputs` is in. A stored blob outlives the type that wrote it,
  -- so reading it back has to know what it is reading rather than guess.
  inputs_version  integer     NOT NULL DEFAULT 1,

  created_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- The list query: everything for one context, newest first.
CREATE INDEX IF NOT EXISTS mortgage_scenarios_owner_idx
  ON mortgage_scenarios (owner_type, owner_id, updated_at DESC);

-- One name per context, so saving twice under the same name updates rather than
-- quietly producing two rows that look identical in the list.
CREATE UNIQUE INDEX IF NOT EXISTS mortgage_scenarios_owner_label_key
  ON mortgage_scenarios (owner_type, owner_id, lower(trim(label)));

ALTER TABLE mortgage_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mortgage_scenarios: personal owner full access"
  ON mortgage_scenarios FOR ALL
  USING      (owner_type = 'personal' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

-- Full access, not SELECT. See the divergence note at the top of this file.
CREATE POLICY "mortgage_scenarios: team member full access"
  ON mortgage_scenarios FOR ALL
  USING (
    owner_type = 'team'
    AND EXISTS (SELECT 1 FROM get_my_team_ids() WHERE team_id = mortgage_scenarios.owner_id)
  )
  WITH CHECK (
    owner_type = 'team'
    AND EXISTS (SELECT 1 FROM get_my_team_ids() WHERE team_id = mortgage_scenarios.owner_id)
  );

DROP TRIGGER IF EXISTS mortgage_scenarios_set_updated_at ON mortgage_scenarios;
CREATE TRIGGER mortgage_scenarios_set_updated_at
  BEFORE UPDATE ON mortgage_scenarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
