-- Shared property model + cash flow analyses.
-- See plans/SHARED-PROPERTY-MODEL.md for why this is two tables and not one.
--
-- properties holds the physical asset and nothing about workflow. A property row
-- is NOT a lead: the CRM's stage/assignee live in pipeline_entries (added with
-- CRM phase 1) so that running numbers on a listing doesn't put it on the
-- pipeline board.
--
-- owner_id has no FK. For owner_type = 'personal' it is auth.users(id); for
-- 'team' it is teams(id). Same approach as bills.context_id. (debts.owner_id
-- carries a FK to auth.users while also allowing owner_type = 'team', which
-- cannot be right — not repeating that here.)

-- ─────────────────────────────────────────────────────────────────────────────
-- properties
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS properties (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type           text        NOT NULL CHECK (owner_type IN ('personal', 'team')),
  owner_id             uuid        NOT NULL,

  address_line1        text        NOT NULL CHECK (char_length(address_line1) > 0),
  city                 text,
  county               text,
  state                text        NOT NULL DEFAULT 'GA',
  zip                  text,

  -- Dedupe keys. parcel_number is authoritative; address_hash is the fallback.
  parcel_number        text,
  address_hash         text        NOT NULL,
  needs_address_review boolean     NOT NULL DEFAULT false,

  -- Where the property first came from. Distinct from pipeline_entries.source,
  -- which only covers properties that became leads — attribution needs both.
  origin               text        NOT NULL DEFAULT 'manual'
                                   CHECK (origin IN ('manual','analysis','import','inbound_web','crm')),

  property_type        text        NOT NULL DEFAULT 'single_family'
                                   CHECK (property_type IN ('single_family','multi_family','condo','townhouse','land','mobile','other')),

  beds                 numeric     CHECK (beds IS NULL OR beds >= 0),
  baths                numeric     CHECK (baths IS NULL OR baths >= 0),
  sqft                 integer     CHECK (sqft IS NULL OR sqft >= 0),
  lot_sqft             integer     CHECK (lot_sqft IS NULL OR lot_sqft >= 0),
  year_built           integer     CHECK (year_built IS NULL OR year_built BETWEEN 1600 AND 2200),

  latitude             numeric,
  longitude            numeric,

  description          text,
  photo_url            text,

  created_by           uuid        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS properties_owner_idx
  ON properties (owner_type, owner_id);

-- Parcel is a real constraint. Two rows with the same parcel in one context is
-- always a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS properties_owner_parcel_key
  ON properties (owner_type, owner_id, parcel_number)
  WHERE parcel_number IS NOT NULL;

-- Address hash is deliberately NOT unique. Normalization is lossy and a false
-- merge is worse than a duplicate, so a hash collision is a review prompt rather
-- than an error.
CREATE INDEX IF NOT EXISTS properties_owner_address_hash_idx
  ON properties (owner_type, owner_id, address_hash);

-- Supports the "show me everything flagged" filter that clears review state in
-- one pass after an import.
CREATE INDEX IF NOT EXISTS properties_needs_review_idx
  ON properties (owner_type, owner_id)
  WHERE needs_address_review;

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "properties: personal owner full access"
  ON properties FOR ALL
  USING      (owner_type = 'personal' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

CREATE POLICY "properties: team member can read"
  ON properties FOR SELECT
  USING (
    owner_type = 'team'
    AND EXISTS (SELECT 1 FROM get_my_team_ids() WHERE team_id = properties.owner_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- analyses  (Cash Flow Analysis)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Inputs only. Cap rate, cash-on-cash, NOI and the projection are computed on
-- read — a stored derived value goes stale the moment an input changes.
--
-- property_id is a plain FK with no uniqueness. Many analyses per property is
-- the point: a house gets re-run as repair estimates firm up, and comparing
-- those runs over time is why they're saved.

CREATE TABLE IF NOT EXISTS analyses (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type                text        NOT NULL CHECK (owner_type IN ('personal', 'team')),
  owner_id                  uuid        NOT NULL,
  property_id               uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  label                     text,

  -- Purchase
  purchase_price            numeric     NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  closing_costs             numeric     NOT NULL DEFAULT 0 CHECK (closing_costs >= 0),
  closing_cost_items        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  closing_costs_itemized    boolean     NOT NULL DEFAULT false,

  rehab_enabled             boolean     NOT NULL DEFAULT false,
  arv                       numeric     CHECK (arv IS NULL OR arv >= 0),
  repair_costs              numeric     NOT NULL DEFAULT 0 CHECK (repair_costs >= 0),
  repair_cost_items         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  repair_costs_itemized     boolean     NOT NULL DEFAULT false,

  -- Financing. Rate is manual entry everywhere in this app; nothing auto-fills it.
  is_cash_purchase          boolean     NOT NULL DEFAULT false,
  down_payment              numeric     NOT NULL DEFAULT 0 CHECK (down_payment >= 0),
  loan_amount_override      numeric     CHECK (loan_amount_override IS NULL OR loan_amount_override >= 0),
  interest_rate             numeric     NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
  loan_term_years           integer     NOT NULL DEFAULT 30 CHECK (loan_term_years BETWEEN 1 AND 50),
  points                    numeric     NOT NULL DEFAULT 0 CHECK (points >= 0),

  -- Income
  gross_monthly_income      numeric     NOT NULL DEFAULT 0 CHECK (gross_monthly_income >= 0),
  income_items              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  income_itemized           boolean     NOT NULL DEFAULT false,

  -- Fixed expenses. The period selector is stored, not normalized away, so the
  -- form can show the figure back the way it was entered.
  property_taxes            numeric     NOT NULL DEFAULT 0 CHECK (property_taxes >= 0),
  property_taxes_period     text        NOT NULL DEFAULT 'annual' CHECK (property_taxes_period IN ('annual','monthly')),
  insurance                 numeric     NOT NULL DEFAULT 0 CHECK (insurance >= 0),
  insurance_period          text        NOT NULL DEFAULT 'annual' CHECK (insurance_period IN ('annual','monthly')),
  electricity_monthly       numeric     NOT NULL DEFAULT 0 CHECK (electricity_monthly >= 0),
  gas_monthly               numeric     NOT NULL DEFAULT 0 CHECK (gas_monthly >= 0),
  water_sewer_monthly       numeric     NOT NULL DEFAULT 0 CHECK (water_sewer_monthly >= 0),
  hoa_monthly               numeric     NOT NULL DEFAULT 0 CHECK (hoa_monthly >= 0),
  garbage_monthly           numeric     NOT NULL DEFAULT 0 CHECK (garbage_monthly >= 0),
  other_monthly             numeric     NOT NULL DEFAULT 0 CHECK (other_monthly >= 0),

  -- Percentage-of-income expenses. Kept structurally distinct from the fixed
  -- amounts above; conflating the two is the commonest source of wrong numbers.
  repairs_pct               numeric     NOT NULL DEFAULT 5  CHECK (repairs_pct >= 0),
  capex_pct                 numeric     NOT NULL DEFAULT 5  CHECK (capex_pct >= 0),
  vacancy_pct               numeric     NOT NULL DEFAULT 5  CHECK (vacancy_pct >= 0),
  management_pct            numeric     NOT NULL DEFAULT 8  CHECK (management_pct >= 0),

  -- Growth assumptions
  property_growth_pct       numeric     NOT NULL DEFAULT 2,
  income_growth_pct         numeric     NOT NULL DEFAULT 2,
  expense_growth_pct        numeric     NOT NULL DEFAULT 2,
  sales_expenses_pct        numeric     NOT NULL DEFAULT 7 CHECK (sales_expenses_pct >= 0),

  archived_at               timestamptz,
  created_by                uuid        NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analyses_owner_idx
  ON analyses (owner_type, owner_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS analyses_property_idx
  ON analyses (property_id, created_at DESC);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analyses: personal owner full access"
  ON analyses FOR ALL
  USING      (owner_type = 'personal' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

CREATE POLICY "analyses: team member can read"
  ON analyses FOR SELECT
  USING (
    owner_type = 'team'
    AND EXISTS (SELECT 1 FROM get_my_team_ids() WHERE team_id = analyses.owner_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_set_updated_at ON properties;
CREATE TRIGGER properties_set_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS analyses_set_updated_at ON analyses;
CREATE TRIGGER analyses_set_updated_at
  BEFORE UPDATE ON analyses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
