-- Comps, valuations and the RentCast usage log.
--
-- Context-shaped and RLS'd the same way as properties and analyses:
-- owner_type/owner_id carried on the row rather than joined for, because all
-- three tables are filtered by owner on every read.

-- ─────────────────────────────────────────────────────────────────────────────
-- property_comps
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per comparable, whether RentCast returned it or someone typed it in
-- from an agent's list.

CREATE TABLE IF NOT EXISTS property_comps (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type        text        NOT NULL CHECK (owner_type IN ('personal', 'team')),
  owner_id          uuid        NOT NULL,

  -- CASCADE, unlike analyses.property_id. An analysis is work that outlives the
  -- lead; a comp is a fact about one house and means nothing without it.
  property_id       uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  source            text        NOT NULL CHECK (source IN ('rentcast', 'manual')),

  -- RentCast's comparable id. Null for hand-entered comps.
  external_id       text,

  formatted_address text        NOT NULL CHECK (char_length(formatted_address) > 0),
  city              text,
  state             text,
  zip               text,
  latitude          numeric,
  longitude         numeric,

  property_type     text,
  beds              numeric     CHECK (beds IS NULL OR beds >= 0),
  baths             numeric     CHECK (baths IS NULL OR baths >= 0),
  sqft              integer     CHECK (sqft IS NULL OR sqft >= 0),
  lot_sqft          integer     CHECK (lot_sqft IS NULL OR lot_sqft >= 0),
  year_built        integer     CHECK (year_built IS NULL OR year_built BETWEEN 1600 AND 2200),

  price             numeric     CHECK (price IS NULL OR price >= 0),

  -- ───────────────────────────────────────────────────────────────────────────
  -- RentCast reports 'Active' or 'Inactive' — NOT sold or listed. An inactive
  -- comp was removed from the market, which might mean it sold and might mean
  -- the seller gave up, and the API does not say which. So:
  --
  --   active  — still listed
  --   removed — delisted, outcome unknown
  --   sold    — a confirmed sale
  --
  -- and the CHECK below enforces that only a human can assert 'sold'. RentCast
  -- cannot confirm a sale, so it must not be able to store one. Counting a
  -- withdrawn listing as a sale is how an ARV ends up too high, and that is a
  -- mistake worth making structurally impossible rather than carefully avoided.
  -- ───────────────────────────────────────────────────────────────────────────
  status            text        NOT NULL CHECK (status IN ('active', 'removed', 'sold')),
  CONSTRAINT property_comps_sold_is_manual
    CHECK (status <> 'sold' OR source = 'manual'),

  listing_type      text,
  listed_date       date,
  removed_date      date,
  last_seen_date    date,
  days_on_market    integer,
  distance_miles    numeric     CHECK (distance_miles IS NULL OR distance_miles >= 0),
  days_old          integer,
  -- RentCast's own similarity score for the comp.
  correlation       numeric,

  -- The include checkbox on the Comps tab. Default true: a comp the API
  -- returned counts until you say it doesn't.
  included          boolean     NOT NULL DEFAULT true,

  notes             text,

  created_by        uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_comps_property_idx
  ON property_comps (property_id, correlation DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS property_comps_owner_idx
  ON property_comps (owner_type, owner_id);

-- A refresh must update the comps it already has rather than appending a second
-- copy of each. Partial, because hand-entered comps have no external_id and
-- several of them on one house is normal.
CREATE UNIQUE INDEX IF NOT EXISTS property_comps_external_key
  ON property_comps (property_id, source, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE property_comps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_comps: personal owner full access"
  ON property_comps FOR ALL
  USING      (owner_type = 'personal' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

CREATE POLICY "property_comps: team member can read"
  ON property_comps FOR SELECT
  USING (
    owner_type = 'team'
    AND EXISTS (SELECT 1 FROM get_my_team_ids() WHERE team_id = property_comps.owner_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- valuations
-- ─────────────────────────────────────────────────────────────────────────────
-- As-is value and after-repair value, one row per estimate, newest current.
-- ARV lives here rather than in a scenario's inputs blob because it is a fact
-- about the house, not an assumption of one analysis — the plan's "every number
-- has one home".

CREATE TABLE IF NOT EXISTS valuations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type         text        NOT NULL CHECK (owner_type IN ('personal', 'team')),
  owner_id           uuid        NOT NULL,
  property_id        uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  kind               text        NOT NULL CHECK (kind IN ('as_is', 'arv')),

  value              numeric     NOT NULL CHECK (value >= 0),
  value_low          numeric     CHECK (value_low IS NULL OR value_low >= 0),
  value_high         numeric     CHECK (value_high IS NULL OR value_high >= 0),

  source             text        NOT NULL CHECK (source IN ('rentcast', 'comps', 'manual')),

  -- Which comps this was built on. Kept as ids so the ARV can be audited back
  -- to the rows that produced it.
  comp_ids           uuid[]      NOT NULL DEFAULT '{}',

  -- Frozen counts behind "3 sold · 2 removed listings".
  --
  -- Derivable from comp_ids today, but a comp's status is editable, so deriving
  -- it would quietly rewrite the history of what this estimate was based on.
  -- The label has to keep describing the comps as they stood when the number
  -- was struck.
  sold_comp_count    integer     NOT NULL DEFAULT 0 CHECK (sold_comp_count >= 0),
  removed_comp_count integer     NOT NULL DEFAULT 0 CHECK (removed_comp_count >= 0),
  active_comp_count  integer     NOT NULL DEFAULT 0 CHECK (active_comp_count >= 0),

  -- Required when the number was overridden by hand: an ARV that disagrees with
  -- the comps needs to say why.
  note               text,
  CONSTRAINT valuations_manual_needs_note
    CHECK (source <> 'manual' OR (note IS NOT NULL AND char_length(trim(note)) > 0)),

  CONSTRAINT valuations_range_ordered
    CHECK (value_low IS NULL OR value_high IS NULL OR value_low <= value_high),

  superseded_at      timestamptz,

  created_by         uuid        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- At most one live valuation per house per kind. Re-estimating stamps
-- superseded_at on the old row rather than deleting it, so the history of what
-- a house was thought to be worth survives.
CREATE UNIQUE INDEX IF NOT EXISTS valuations_one_current_per_kind
  ON valuations (property_id, kind)
  WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS valuations_property_idx
  ON valuations (property_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS valuations_owner_idx
  ON valuations (owner_type, owner_id);

ALTER TABLE valuations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "valuations: personal owner full access"
  ON valuations FOR ALL
  USING      (owner_type = 'personal' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

CREATE POLICY "valuations: team member can read"
  ON valuations FOR SELECT
  USING (
    owner_type = 'team'
    AND EXISTS (SELECT 1 FROM get_my_team_ids() WHERE team_id = valuations.owner_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- rentcast_requests
-- ─────────────────────────────────────────────────────────────────────────────
-- Every call, logged. The free plan allows 50 a month, so Settings →
-- Integrations needs to count them and warn at 80%, and that counter has to be
-- trustworthy before anyone leans on it.

CREATE TABLE IF NOT EXISTS rentcast_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type    text        NOT NULL CHECK (owner_type IN ('personal', 'team')),
  owner_id      uuid        NOT NULL,

  -- SET NULL, not CASCADE: the request was made and billed whether or not the
  -- house is still in the system. Deleting a property must not make the month's
  -- usage look lower than it was.
  property_id   uuid        REFERENCES properties(id) ON DELETE SET NULL,

  endpoint      text        NOT NULL,
  status_code   integer,
  succeeded     boolean     NOT NULL,

  -- Whether this consumed quota. A request refused locally for a missing key,
  -- or a 429 that never reached an estimate, must not be counted against the
  -- 50 — a counter that over-reports makes people stop trusting it and stop
  -- looking at it.
  billable      boolean     NOT NULL DEFAULT true,

  error         text,

  requested_at  timestamptz NOT NULL DEFAULT now()
);

-- Serves the one query that matters: this month's billable count for this owner.
CREATE INDEX IF NOT EXISTS rentcast_requests_owner_month_idx
  ON rentcast_requests (owner_type, owner_id, requested_at DESC)
  WHERE billable;

ALTER TABLE rentcast_requests ENABLE ROW LEVEL SECURITY;

-- Append-only: SELECT and INSERT, no UPDATE or DELETE policy. A usage log you
-- can edit is not a usage log.
CREATE POLICY "rentcast_requests: personal owner can read"
  ON rentcast_requests FOR SELECT
  USING (owner_type = 'personal' AND owner_id = auth.uid());

CREATE POLICY "rentcast_requests: personal owner can insert"
  ON rentcast_requests FOR INSERT
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

CREATE POLICY "rentcast_requests: team member can read"
  ON rentcast_requests FOR SELECT
  USING (
    owner_type = 'team'
    AND EXISTS (SELECT 1 FROM get_my_team_ids() WHERE team_id = rentcast_requests.owner_id)
  );

-- ── Down ─────────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS rentcast_requests;
-- DROP TABLE IF EXISTS valuations;
-- DROP TABLE IF EXISTS property_comps;
