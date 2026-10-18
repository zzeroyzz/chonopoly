-- Property facts that RentCast returns and the screening flow needs.
--
-- The plan listed this migration as "beds, baths, sqft, year built, annual
-- taxes, listing URL, adding only the ones that don't already exist". Checked
-- against the 2026-09-07 schema: beds, baths, sqft, lot_sqft, year_built,
-- property_type, latitude and longitude ALL already exist. So this migration is
-- four columns of facts, not twelve, plus provenance and one checklist fact.

-- ── 1. The facts that were genuinely missing ─────────────────────────────────

ALTER TABLE properties
  -- Annual property tax. Distinct from the scenario's propertyTaxYearly, which
  -- is one analysis's assumption; this is what the house actually bills.
  ADD COLUMN IF NOT EXISTS annual_taxes    numeric
    CHECK (annual_taxes IS NULL OR annual_taxes >= 0),

  -- Where the listing lives. Batch add accepts a link per address, and the
  -- screen table needs somewhere to send you to look at the photos.
  ADD COLUMN IF NOT EXISTS listing_url     text,

  -- RentCast's subjectProperty returns both. The last sale anchors an ARV
  -- sanity check: an after-repair value well under the last sale price is a
  -- prompt to look again, not a number to act on.
  ADD COLUMN IF NOT EXISTS last_sale_date  date,
  ADD COLUMN IF NOT EXISTS last_sale_price numeric
    CHECK (last_sale_price IS NULL OR last_sale_price >= 0);

-- ── 2. Where the facts came from ─────────────────────────────────────────────
-- Without this, a hand-corrected sqft and a RentCast-supplied sqft are
-- indistinguishable, so the next refresh silently overwrites the correction.
-- The client must not clobber 'manual' facts with API values.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS facts_source text NOT NULL DEFAULT 'manual'
    CHECK (facts_source IN ('manual', 'rentcast')),
  ADD COLUMN IF NOT EXISTS facts_updated_at timestamptz;

-- ── 3. The one checklist step that is a stored fact ──────────────────────────
--
-- The progress checklist is Numbers · Comps · Estimate · Visit. Three of those
-- four are questions the database can already answer:
--
--   Numbers  — a primary financing analysis exists for this property
--   Comps    — any property_comps rows exist for it
--   Estimate — a rehab analysis exists for it
--
-- Storing those as booleans would create a second source of truth that drifts
-- the moment someone archives an analysis, so they stay derived. A site visit
-- leaves no other trace in the schema, so it is the only one that needs a
-- column.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS visit_completed_at timestamptz;

-- ── Down ─────────────────────────────────────────────────────────────────────
-- ALTER TABLE properties
--   DROP COLUMN IF EXISTS annual_taxes,
--   DROP COLUMN IF EXISTS listing_url,
--   DROP COLUMN IF EXISTS last_sale_date,
--   DROP COLUMN IF EXISTS last_sale_price,
--   DROP COLUMN IF EXISTS facts_source,
--   DROP COLUMN IF EXISTS facts_updated_at,
--   DROP COLUMN IF EXISTS visit_completed_at;
