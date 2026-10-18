export type Stage =
  | "new_lead"
  | "contacted"
  | "qualified"
  | "offer"
  | "under_contract"
  | "closed"
  | "dead";

export type LeadSource = "manual" | "import" | "inbound_web" | "analysis";

export type TaskStatus = "open" | "done" | "skipped";

/** The rungs of the follow-up cadence, in days. */
export type CadenceStep = 7 | 14 | 30;

export type PhoneSuppressionReason = "federal_dnc" | "seller_request" | "wrong_number";
export type EmailSuppressionReason = "unsubscribed" | "seller_request" | "wrong_address";

export interface PipelineEntry {
  id: string;
  owner_type: "personal" | "team";
  owner_id: string;
  property_id: string;
  stage: Stage;
  stage_since: string;
  assigned_to: string | null;
  source: LeadSource;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  pipeline_entry_id: string;
  assigned_to: string | null;
  title: string;
  due_date: string;
  status: TaskStatus;
  auto_generated: boolean;
  cadence_step: CadenceStep | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
}

export interface ContactPhone {
  id: string;
  contact_id: string;
  number: string;
  line_type: "mobile" | "landline" | "voip" | "unknown";
  status: "unknown" | "valid" | "disconnected";
  suppression_reason: PhoneSuppressionReason | null;
  suppressed_at: string | null;
  suppressed_by: string | null;
  confidence: number | null;
  source: "import" | "manual" | "inbound";
  is_primary: boolean;
  created_at: string;
}

export interface ContactEmail {
  id: string;
  contact_id: string;
  email: string;
  status: "unknown" | "valid" | "bounced";
  suppression_reason: EmailSuppressionReason | null;
  suppressed_at: string | null;
  suppressed_by: string | null;
  source: "import" | "manual" | "inbound";
  is_primary: boolean;
  created_at: string;
}

export type Relationship =
  | "owner"
  | "co_owner"
  | "heir"
  | "agent"
  | "tenant"
  | "neighbor"
  | "unknown";

export type ActivityType = "call" | "text" | "email" | "note" | "door_knock" | "mail" | "web_form";

export type ActivityOutcome =
  | "no_answer"
  | "connected"
  | "voicemail"
  | "wrong_number"
  | "not_interested"
  | "callback_requested"
  | "appointment_set";

export interface Activity {
  id: string;
  pipeline_entry_id: string;
  contact_id: string | null;
  user_id: string;
  type: ActivityType;
  direction: "inbound" | "outbound" | "na";
  outcome: ActivityOutcome | null;
  body: string | null;
  occurred_at: string;
  created_at: string;
}

export interface StageHistoryRow {
  id: string;
  pipeline_entry_id: string;
  from_stage: Stage | null;
  to_stage: Stage;
  changed_by: string;
  changed_at: string;
  note: string | null;
}

/** A contact with its channels, as the detail screen needs it. */
export interface ContactWithChannels {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  mailing_address_line1: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  notes: string | null;
  phones: ContactPhone[];
  emails: ContactEmail[];
  relationship: Relationship;
  isPrimary: boolean;
}

/** Everything the property detail screen renders. */
export interface PropertyDetail {
  /**
   * Null when the house is not on the pipeline.
   *
   * A property exists whether or not it is a lead — one added from the
   * calculator or a batch paste has no entry until someone works it, and it
   * still has an address, facts, comps and analyses worth looking at. Treating
   * the entry as required meant those houses had no viewable page at all.
   */
  entry: PipelineEntry | null;
  property: PropertyLike | null;
  contacts: ContactWithChannels[];
  tasks: Task[];
  activities: Activity[];
  history: StageHistoryRow[];
}

/**
 * The shape of `properties` the CRM reads. Narrower than the property module's
 * own type on purpose — the CRM shows identity, not analysis.
 */
export interface PropertyLike {
  id: string;
  address_line1: string;
  city: string | null;
  county: string | null;
  state: string | null;
  zip: string | null;
  parcel_number: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  needs_address_review: boolean;
}

/** A row in the pipeline list, joined for display. */
export interface PipelineRow {
  entry: PipelineEntry;
  addressLine1: string;
  city: string | null;
  /** Open tasks on this entry, soonest due first. */
  openTasks: Task[];
}
