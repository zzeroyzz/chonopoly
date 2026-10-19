-- Tax defaults on the buyer profile, for the capital-gains estimate.
--
-- WRITTEN, NOT RUN. Needs the owner's approval before it touches production,
-- like every other migration in this project.
--
-- Capital gains was a figure the user typed into the Profit card, which meant
-- it was usually zero and the walk-away number was usually wrong by five
-- figures. It is derivable from what the deal already knows, but the rates are
-- not: they depend on the filing status and bracket of the person, not the
-- house. So they live with the rest of the loan and cost defaults.
--
-- Personal-only, inheriting the policies already on buyer_profiles — a bracket
-- says as much about income as a salary does, and teams here can include
-- agents and assistants.

ALTER TABLE buyer_profiles
  ADD COLUMN IF NOT EXISTS filing_status text NOT NULL DEFAULT 'single'
    CHECK (filing_status IN (
      'single', 'married_joint', 'married_separate', 'head_of_household'
    )),

  -- A flip held a year or less is taxed as ordinary income, which is the case
  -- that surprises people. Both rates are kept so the hold decides which one
  -- applies rather than the user remembering to change it.
  ADD COLUMN IF NOT EXISTS federal_ordinary_pct numeric NOT NULL DEFAULT 24
    CHECK (federal_ordinary_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS federal_long_term_pct numeric NOT NULL DEFAULT 15
    CHECK (federal_long_term_pct BETWEEN 0 AND 100),

  -- Keyed by two-letter state, so one profile can screen houses in more than
  -- one. Georgia is seeded because that is where the pipeline is; the shape is
  -- jsonb rather than a column so adding a state is data, not a migration.
  ADD COLUMN IF NOT EXISTS state_tax_rates_pct jsonb NOT NULL DEFAULT '{"GA": 5.39}'::jsonb;

-- Down path, for the owner to run if this is rolled back:
--
-- ALTER TABLE buyer_profiles
--   DROP COLUMN IF EXISTS filing_status,
--   DROP COLUMN IF EXISTS federal_ordinary_pct,
--   DROP COLUMN IF EXISTS federal_long_term_pct,
--   DROP COLUMN IF EXISTS state_tax_rates_pct;
