-- CRM phase 1: the workflow half of the property model.
-- See plans/CRM-PHASE-1-PLAN.md.
--
-- properties already exists and doesn't change. A property row is not a lead —
-- the lead is a pipeline_entries row, which is what lets a cash flow analysis
-- create a property without putting it on anyone's follow-up list.
--
-- Owner scoping is owner_type / owner_id per resolveContext, same as every other
-- table. No workspaces concept; see plans/SHARED-PROPERTY-MODEL.md.

-- ─────────────────────────────────────────────────────────────────────────────
-- pipeline_entries
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_entries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type    text        NOT NULL CHECK (owner_type IN ('personal','team')),
  owner_id      uuid        NOT NULL,
  property_id   uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  stage         text        NOT NULL DEFAULT 'new_lead'
                            CHECK (stage IN ('new_lead','contacted','qualified','offer','under_contract','closed','dead')),
  -- When the current stage was entered. Drives "days in stage" and the cadence.
  stage_since   timestamptz NOT NULL DEFAULT now(),

  assigned_to   uuid,
  source        text        NOT NULL DEFAULT 'manual'
                            CHECK (source IN ('manual','import','inbound_web','analysis')),

  created_by    uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One live entry per property. A dead lead that revives reuses its entry rather
-- than starting a second one, which is why this isn't filtered on stage.
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_entries_property_key
  ON pipeline_entries (owner_type, owner_id, property_id);

CREATE INDEX IF NOT EXISTS pipeline_entries_owner_stage_idx
  ON pipeline_entries (owner_type, owner_id, stage, stage_since);

ALTER TABLE pipeline_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_entries: personal owner full access"
  ON pipeline_entries FOR ALL
  USING      (owner_type = 'personal' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

CREATE POLICY "pipeline_entries: team member can read"
  ON pipeline_entries FOR SELECT
  USING (
    owner_type = 'team'
    AND EXISTS (SELECT 1 FROM get_my_team_ids() WHERE team_id = pipeline_entries.owner_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- property_stage_history
-- ─────────────────────────────────────────────────────────────────────────────
-- Every transition. This is how follow-up discipline gets measured later, so it
-- records the move even when the move is backwards.

CREATE TABLE IF NOT EXISTS property_stage_history (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_entry_id uuid        NOT NULL REFERENCES pipeline_entries(id) ON DELETE CASCADE,
  from_stage        text,
  to_stage          text        NOT NULL,
  changed_by        uuid        NOT NULL,
  changed_at        timestamptz NOT NULL DEFAULT now(),
  note              text
);

CREATE INDEX IF NOT EXISTS property_stage_history_entry_idx
  ON property_stage_history (pipeline_entry_id, changed_at DESC);

ALTER TABLE property_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_stage_history: readable with its entry"
  ON property_stage_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM pipeline_entries p WHERE p.id = pipeline_entry_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- contacts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contacts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type            text        NOT NULL CHECK (owner_type IN ('personal','team')),
  owner_id              uuid        NOT NULL,

  first_name            text,
  last_name             text,
  -- Entity-owned property is common; the LLC is the owner, not a person.
  company               text,

  mailing_address_line1 text,
  mailing_city          text,
  mailing_state         text,
  mailing_zip           text,
  notes                 text,

  created_by            uuid        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_owner_idx ON contacts (owner_type, owner_id);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts: personal owner full access"
  ON contacts FOR ALL
  USING      (owner_type = 'personal' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

CREATE POLICY "contacts: team member can read"
  ON contacts FOR SELECT
  USING (
    owner_type = 'team'
    AND EXISTS (SELECT 1 FROM get_my_team_ids() WHERE team_id = contacts.owner_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- property_contacts
-- ─────────────────────────────────────────────────────────────────────────────
-- Many-to-many both ways: one property can have several owners, one owner can
-- hold several properties, and the same property can come back later with a
-- different owner. Keyed on property_id, not the pipeline entry — who owns a
-- house is a fact about the house, not about working the lead.

CREATE TABLE IF NOT EXISTS property_contacts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  contact_id   uuid        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  relationship text        NOT NULL DEFAULT 'owner'
                           CHECK (relationship IN ('owner','co_owner','heir','agent','tenant','neighbor','unknown')),
  is_primary   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, contact_id, relationship)
);

CREATE INDEX IF NOT EXISTS property_contacts_property_idx ON property_contacts (property_id);
CREATE INDEX IF NOT EXISTS property_contacts_contact_idx ON property_contacts (contact_id);

ALTER TABLE property_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_contacts: readable with its property"
  ON property_contacts FOR SELECT
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- contact_phones
-- ─────────────────────────────────────────────────────────────────────────────
-- Separate table because skip tracing returns several numbers per contact with
-- varying quality.
--
-- Suppression is three columns, not one boolean, and the reason matters:
--   federal_dnc    can expire off a list or be scrubbed again
--   seller_request never expires — the one you most need visible
--   wrong_number   not DNC and not a request, but the commonest reason not to
--                  redial. Without its own slot people mark it DNC and pollute
--                  the real DNC data.
--
-- suppressed_at and suppressed_by exist because a boolean tells you the current
-- state but can't show that a request was honoured the day it was made. TCPA
-- exposure runs $500–$1,500 per violating call or text; if it's ever disputed,
-- demonstrating when you knew is the whole thing.

CREATE TABLE IF NOT EXISTS contact_phones (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id         uuid        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  number             text        NOT NULL,
  line_type          text        NOT NULL DEFAULT 'unknown'
                                 CHECK (line_type IN ('mobile','landline','voip','unknown')),
  status             text        NOT NULL DEFAULT 'unknown'
                                 CHECK (status IN ('unknown','valid','disconnected')),

  suppression_reason text        CHECK (suppression_reason IN ('federal_dnc','seller_request','wrong_number')),
  suppressed_at      timestamptz,
  suppressed_by      uuid,

  confidence         integer     CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  source             text        NOT NULL DEFAULT 'manual'
                                 CHECK (source IN ('import','manual','inbound')),
  is_primary         boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- A suppressed number must say who suppressed it and when. Enforced here so
  -- the audit trail can't be skipped by a careless insert.
  CONSTRAINT contact_phones_suppression_is_attributed CHECK (
    suppression_reason IS NULL
    OR (suppressed_at IS NOT NULL AND suppressed_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS contact_phones_contact_idx ON contact_phones (contact_id);

ALTER TABLE contact_phones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_phones: readable with its contact"
  ON contact_phones FOR SELECT
  USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- contact_emails
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_emails (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id         uuid        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  email              text        NOT NULL,
  status             text        NOT NULL DEFAULT 'unknown'
                                 CHECK (status IN ('unknown','valid','bounced')),
  suppression_reason text        CHECK (suppression_reason IN ('unsubscribed','seller_request','wrong_address')),
  suppressed_at      timestamptz,
  suppressed_by      uuid,
  source             text        NOT NULL DEFAULT 'manual'
                                 CHECK (source IN ('import','manual','inbound')),
  is_primary         boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contact_emails_suppression_is_attributed CHECK (
    suppression_reason IS NULL
    OR (suppressed_at IS NOT NULL AND suppressed_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS contact_emails_contact_idx ON contact_emails (contact_id);

ALTER TABLE contact_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_emails: readable with its contact"
  ON contact_emails FOR SELECT
  USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- activities
-- ─────────────────────────────────────────────────────────────────────────────
-- Every touch, attributed by user. This is what stops two people dialling the
-- same seller on the same afternoon.

CREATE TABLE IF NOT EXISTS activities (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_entry_id uuid        NOT NULL REFERENCES pipeline_entries(id) ON DELETE CASCADE,
  contact_id        uuid        REFERENCES contacts(id) ON DELETE SET NULL,
  user_id           uuid        NOT NULL,

  type              text        NOT NULL
                                CHECK (type IN ('call','text','email','note','door_knock','mail','web_form')),
  direction         text        NOT NULL DEFAULT 'outbound'
                                CHECK (direction IN ('inbound','outbound','na')),
  outcome           text        CHECK (outcome IN ('no_answer','connected','voicemail','wrong_number','not_interested','callback_requested','appointment_set')),
  body              text,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activities_entry_idx ON activities (pipeline_entry_id, occurred_at DESC);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities: readable with its entry"
  ON activities FOR SELECT
  USING (EXISTS (SELECT 1 FROM pipeline_entries p WHERE p.id = pipeline_entry_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- tasks
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_entry_id uuid        NOT NULL REFERENCES pipeline_entries(id) ON DELETE CASCADE,
  assigned_to       uuid,
  title             text        NOT NULL,
  due_date          date        NOT NULL,
  status            text        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open','done','skipped')),
  auto_generated    boolean     NOT NULL DEFAULT false,
  -- 7, 14 or 30 — which rung of the follow-up cadence generated this.
  cadence_step      integer     CHECK (cadence_step IS NULL OR cadence_step IN (7,14,30)),
  completed_at      timestamptz,
  completed_by      uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_entry_open_idx
  ON tasks (pipeline_entry_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS tasks_due_idx
  ON tasks (assigned_to, due_date) WHERE status = 'open';

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks: readable with its entry"
  ON tasks FOR SELECT
  USING (EXISTS (SELECT 1 FROM pipeline_entries p WHERE p.id = pipeline_entry_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Stage change + cadence, as one explicit function
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Not a trigger and not application code.
--
-- A trigger is invisible: nothing at the call site says a task was created, and
-- the next person reading the stage-change path won't know it happens.
-- Application code can't make the task and the stage change atomic, so a failure
-- between them silently drops a follow-up — which is exactly the thing the
-- cadence exists to prevent.
--
-- An RPC is both: one statement, and the app calls it by name so a reader
-- following the code finds it.

CREATE OR REPLACE FUNCTION crm_change_stage(
  p_entry_id uuid,
  p_to_stage text,
  p_user_id  uuid,
  p_note     text DEFAULT NULL
)
RETURNS pipeline_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry     pipeline_entries;
  v_from      text;
  v_due       date;
BEGIN
  SELECT * INTO v_entry FROM pipeline_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pipeline entry % not found', p_entry_id;
  END IF;

  v_from := v_entry.stage;

  -- A no-op stage change still shouldn't silently generate a second follow-up.
  IF v_from = p_to_stage THEN
    RETURN v_entry;
  END IF;

  UPDATE pipeline_entries
     SET stage = p_to_stage,
         stage_since = now(),
         updated_at = now()
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  INSERT INTO property_stage_history (pipeline_entry_id, from_stage, to_stage, changed_by, note)
  VALUES (p_entry_id, v_from, p_to_stage, p_user_id, p_note);

  -- Entering contacted starts the cadence. Most deals close on the fifth or
  -- sixth touch; this exists so nothing goes quiet by accident.
  IF p_to_stage = 'contacted' THEN
    v_due := (now() + interval '7 days')::date;

    INSERT INTO tasks (pipeline_entry_id, assigned_to, title, due_date, auto_generated, cadence_step)
    SELECT p_entry_id, v_entry.assigned_to, 'Follow up', v_due, true, 7
     WHERE NOT EXISTS (
       SELECT 1 FROM tasks
        WHERE pipeline_entry_id = p_entry_id
          AND status = 'open'
          AND auto_generated
     );
  END IF;

  -- Leaving the funnel closes out the automatic chase. A hand-created task
  -- stays, because someone put it there on purpose.
  IF p_to_stage IN ('qualified','closed','dead') THEN
    UPDATE tasks
       SET status = 'skipped'
     WHERE pipeline_entry_id = p_entry_id
       AND status = 'open'
       AND auto_generated;
  END IF;

  RETURN v_entry;
END;
$$;

-- Completing an auto task without a stage advance generates the next rung.
-- 7 -> 14 -> 30, then the chase stops and the dashboard's no-open-task defect
-- list surfaces it for a human decision.
CREATE OR REPLACE FUNCTION crm_complete_task(
  p_task_id uuid,
  p_user_id uuid
)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task  tasks;
  v_entry pipeline_entries;
  v_next  integer;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task % not found', p_task_id;
  END IF;

  UPDATE tasks
     SET status = 'done', completed_at = now(), completed_by = p_user_id
   WHERE id = p_task_id
  RETURNING * INTO v_task;

  IF NOT v_task.auto_generated OR v_task.cadence_step IS NULL THEN
    RETURN v_task;
  END IF;

  SELECT * INTO v_entry FROM pipeline_entries WHERE id = v_task.pipeline_entry_id;

  -- Only keep chasing while the lead is still sitting in contacted.
  IF v_entry.stage <> 'contacted' THEN
    RETURN v_task;
  END IF;

  v_next := CASE v_task.cadence_step WHEN 7 THEN 14 WHEN 14 THEN 30 ELSE NULL END;
  IF v_next IS NULL THEN
    RETURN v_task;
  END IF;

  INSERT INTO tasks (pipeline_entry_id, assigned_to, title, due_date, auto_generated, cadence_step)
  VALUES (
    v_task.pipeline_entry_id,
    v_entry.assigned_to,
    'Follow up',
    (now() + (v_next || ' days')::interval)::date,
    true,
    v_next
  );

  RETURN v_task;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS pipeline_entries_set_updated_at ON pipeline_entries;
CREATE TRIGGER pipeline_entries_set_updated_at
  BEFORE UPDATE ON pipeline_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS contacts_set_updated_at ON contacts;
CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
