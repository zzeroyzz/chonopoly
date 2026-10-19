-- Finalists and offers.
--
-- WRITTEN, NOT RUN. Needs the owner's approval before it touches production.
--
-- The app is built to work without these: the finalist flag is read through a
-- select that retries without it, and the offers table is read through a query
-- whose failure degrades to "no offers yet". A missing column or table must
-- never take the Properties list or a property page down — that is the lesson
-- from the tax defaults migration, where an UPDATE naming an absent column
-- would have stopped the whole Defaults form saving.

-- ─────────────────────────────────────────────────────────────────────────────
-- Finalists
-- ─────────────────────────────────────────────────────────────────────────────
-- A flag on the property rather than a separate table. "Is this one of the
-- handful I am actually deciding between" is a property of the house in this
-- pipeline, not a relationship worth its own row, and the Properties list
-- filters on it on every load.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_finalist boolean NOT NULL DEFAULT false;

-- Partial: the filtered view only ever asks for the true ones, and finalists
-- are a handful out of everything.
CREATE INDEX IF NOT EXISTS properties_finalists_idx
  ON properties (owner_type, owner_id)
  WHERE is_finalist;

-- ─────────────────────────────────────────────────────────────────────────────
-- Offers
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per offer, kept as history rather than a single current figure.
-- What you first offered, what they countered, and what was accepted are three
-- different numbers, and a deal is argued about using all three.

CREATE TABLE IF NOT EXISTS offers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type  text        NOT NULL CHECK (owner_type IN ('personal', 'team')),
  owner_id    uuid        NOT NULL,

  -- CASCADE: an offer is meaningless without the house it was made on.
  property_id uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  amount      numeric     NOT NULL CHECK (amount >= 0),
  -- The date the offer was made, which is not always the day it was typed in.
  offered_on  date        NOT NULL DEFAULT CURRENT_DATE,

  -- Deliberately NOT a pipeline stage. Making an offer does not move a lead:
  -- the CRM stage is the owner's to change, and an offer that gets rejected
  -- should not have dragged the house forward and back again.
  status      text        NOT NULL DEFAULT 'drafted'
                          CHECK (status IN (
                            'drafted', 'submitted', 'countered', 'accepted', 'rejected'
                          )),

  note        text,

  created_by  uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offers_property_idx
  ON offers (owner_type, owner_id, property_id, offered_on DESC);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offers: personal owner full access"
  ON offers FOR ALL
  USING      (owner_type = 'personal' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

-- Read-only for teams, matching properties, analyses, comps and valuations.
-- Every team policy in this schema is SELECT-only; see open question 4 in the
-- rebuild plan. This deliberately does not become the one exception.
CREATE POLICY "offers: team readable"
  ON offers FOR SELECT
  USING (
    owner_type = 'team'
    AND EXISTS (SELECT 1 FROM get_my_team_ids() WHERE team_id = offers.owner_id)
  );

-- Down path, for the owner to run if this is rolled back:
--
-- DROP TABLE IF EXISTS offers;
-- DROP INDEX IF EXISTS properties_finalists_idx;
-- ALTER TABLE properties DROP COLUMN IF EXISTS is_finalist;
