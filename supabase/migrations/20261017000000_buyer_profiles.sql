-- The buyer profile: who you are, what you earn, what you owe, and the loan and
-- cost defaults every screening starts from.
--
-- You enter this once. Every ratio reads it, and it changes only when you edit
-- it. That is what removes income and debt from the calculator form, where they
-- had to be retyped for every house.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ACCESS: personal only, deliberately.
--
-- The owner_type / owner_id pair matches every other table here, so a team
-- policy can be added later without migrating a table full of income. But no
-- team policy is written, and that is not an oversight: a team in this app can
-- include an agent or an assistant, and a salary is not theirs to read.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS buyer_profiles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type  text        NOT NULL CHECK (owner_type IN ('personal','team')),
  owner_id    uuid        NOT NULL,

  -- Cash (Settings → profile)
  cash_available numeric  NOT NULL DEFAULT 0 CHECK (cash_available >= 0),
  cash_reserves  numeric  NOT NULL DEFAULT 0 CHECK (cash_reserves  >= 0),

  -- Loan defaults (Settings → defaults). Seeded from defaultInputs() so a new
  -- profile starts where the calculator already starts.
  loan_type          text    NOT NULL DEFAULT 'fha',
  renovation_program text    NOT NULL DEFAULT 'none',
  interest_rate      numeric NOT NULL DEFAULT 6.75 CHECK (interest_rate >= 0),
  term_years         integer NOT NULL DEFAULT 30   CHECK (term_years > 0),
  down_payment_pct   numeric NOT NULL DEFAULT 3.5  CHECK (down_payment_pct BETWEEN 0 AND 100),
  closing_cost_pct   numeric NOT NULL DEFAULT 5    CHECK (closing_cost_pct BETWEEN 0 AND 100),
  county_loan_limit  numeric CHECK (county_loan_limit IS NULL OR county_loan_limit > 0),
  dpa_enabled        boolean NOT NULL DEFAULT false,
  dpa_structure      text    NOT NULL DEFAULT 'grant'
                             CHECK (dpa_structure IN ('grant','deferred','amortizing')),
  dpa_rate           numeric NOT NULL DEFAULT 0  CHECK (dpa_rate >= 0),
  dpa_term_years     integer NOT NULL DEFAULT 10 CHECK (dpa_term_years > 0),

  -- Flip cost defaults. Unused until Phase 4, but they belong to the same
  -- Settings screen — splitting them out means a second migration on this table.
  buying_pct             numeric NOT NULL DEFAULT 1   CHECK (buying_pct  BETWEEN 0 AND 100),
  selling_pct            numeric NOT NULL DEFAULT 8   CHECK (selling_pct BETWEEN 0 AND 100),
  holding_monthly        numeric NOT NULL DEFAULT 750 CHECK (holding_monthly >= 0),
  holding_months         integer NOT NULL DEFAULT 5   CHECK (holding_months  >= 0),
  contingency_photos_pct numeric NOT NULL DEFAULT 20  CHECK (contingency_photos_pct BETWEEN 0 AND 100),
  contingency_visit_pct  numeric NOT NULL DEFAULT 10  CHECK (contingency_visit_pct  BETWEEN 0 AND 100),

  created_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One profile per context. resolveInputs needs a single answer to "what do I earn".
CREATE UNIQUE INDEX IF NOT EXISTS buyer_profiles_owner_key
  ON buyer_profiles (owner_type, owner_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Income and debts are itemised, never a lump sum.
--
-- A single "monthly debts" total is unauditable: you cannot tell later which
-- debts it covered, and include_in_ratios has nothing to attach to. The summing
-- happens in resolveInputs, so otherMonthlyDebt is always derived and never
-- entered directly.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profile_incomes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid        NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,

  label         text        NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  income_type   text        NOT NULL DEFAULT 'w2'
                            CHECK (income_type IN ('w2','hourly','self_employed','other')),
  gross_monthly numeric     NOT NULL CHECK (gross_monthly >= 0),

  -- Captured for a future joint-application view. Phase 0 sums every row
  -- regardless, so this does not filter anything yet.
  borrower      text,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_incomes_profile_idx ON profile_incomes (profile_id);

CREATE TABLE IF NOT EXISTS profile_debts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid        NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,

  label           text        NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  debt_type       text        NOT NULL DEFAULT 'other',
  monthly_payment numeric     NOT NULL CHECK (monthly_payment >= 0),

  -- Lenders exclude debts: a loan with three payments left, a co-signed note
  -- someone else pays. Defaults true, because counting a debt lowers what you
  -- qualify for and that is the safe direction to be wrong in.
  include_in_ratios boolean   NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_debts_profile_idx ON profile_debts (profile_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Snapshot, so a saved scenario can say "your numbers changed since this ran".
--
-- Holds the profile and defaults KEYS ONLY — never the whole resolved inputs
-- object. startMonth and startYear resolve to "today", so snapshotting
-- everything would make every saved scenario claim its numbers changed on the
-- first of each month, forever.
--
-- Income and debt figures are redacted on team-owned rows: this table grants
-- teams FOR ALL, and personal-only profiles with team-readable salaries would
-- be a side door around the policy above. The snapshot stores a hash of the
-- totals there — enough to detect a change, not enough to read a salary.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mortgage_scenarios
  ADD COLUMN IF NOT EXISTS profile_snapshot jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE buyer_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_debts   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyer_profiles: personal owner only"
  ON buyer_profiles FOR ALL
  USING      (owner_type = 'personal' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

-- Children delegate to the parent rather than restating the rule, so the two
-- cannot drift apart — the pattern mortgage_scenario_versions already uses.
CREATE POLICY "profile_incomes: follows its profile"
  ON profile_incomes FOR ALL
  USING      (EXISTS (SELECT 1 FROM buyer_profiles p WHERE p.id = profile_id))
  WITH CHECK (EXISTS (SELECT 1 FROM buyer_profiles p WHERE p.id = profile_id));

CREATE POLICY "profile_debts: follows its profile"
  ON profile_debts FOR ALL
  USING      (EXISTS (SELECT 1 FROM buyer_profiles p WHERE p.id = profile_id))
  WITH CHECK (EXISTS (SELECT 1 FROM buyer_profiles p WHERE p.id = profile_id));

DROP TRIGGER IF EXISTS buyer_profiles_set_updated_at ON buyer_profiles;
CREATE TRIGGER buyer_profiles_set_updated_at
  BEFORE UPDATE ON buyer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Down
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS profile_debts, profile_incomes, buyer_profiles CASCADE;
-- ALTER TABLE mortgage_scenarios DROP COLUMN IF EXISTS profile_snapshot;
