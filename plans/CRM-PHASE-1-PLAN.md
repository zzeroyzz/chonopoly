# CRM Phase 1 — Implementation Plan

Plan only. No code written. Awaiting approval.

Goal: create a property by hand and walk it through the pipeline end to end.
No import, no vendor fields, no buyers, no messaging.

---

## 0. The spec is not in the repo

`plans/` has the mortgage, cash flow, market analysis and shared property docs.
There is no wholesaling CRM spec — it was discarded before it was ever committed
and isn't recoverable from git.

Everything below is derived from a copy held in conversation. **Check it against
the real file before building**, and paste the spec into
`plans/WHOLESALING-CRM-SPEC.md` so this stops being a risk.

One concrete discrepancy already: my copy lists seven stages (`new_lead`,
`contacted`, `qualified`, `offer`, `under_contract`, `closed`, `dead`). Review
counted six, treating closed and dead as one terminal column. The board renders
them as one column either way, but the count mismatch is worth resolving against
the source.

## 1. What already exists

`properties` and `analyses` are migrated and live, with the identity-versus-
pipeline split from `SHARED-PROPERTY-MODEL.md`. A property row is not a lead.

So phase 1 adds the workflow half, and nothing about the existing tables changes.

## 2. Tables

All owner-scoped with `owner_type` / `owner_id` per `resolveContext`, RLS on the
personal-owner and team-read pattern. No `workspaces` table — that decision is in
the shared property model doc.

### `pipeline_entries`
The lead. `property_id`, `stage`, `assigned_to`, `source`, timestamps. One active
entry per property per owner; a dead lead that revives reuses its entry.

### `property_stage_history`
Every transition: `pipeline_entry_id`, `from_stage`, `to_stage`, `changed_by`,
`changed_at`, `note`. This is how follow-up discipline gets measured later.

### `contacts`
Name, company, mailing address, notes. Owner-scoped.

### `property_contacts`
Join, many-to-many both ways: `property_id`, `contact_id`, `relationship`
(owner, co_owner, heir, agent, tenant, neighbor, unknown), `is_primary`.
On `property_id`, not the pipeline entry — ownership is a fact about the house.

### `contact_phones`
Separate table because skip tracing returns several numbers of varying quality.
`number` (E.164), `line_type`, `status`, `confidence`, `source`, `is_primary`.

Suppression, expanded from the spec after review:

| column | purpose |
|---|---|
| `suppression_reason` | null, `federal_dnc`, `seller_request`, `wrong_number` |
| `suppressed_at` | when |
| `suppressed_by` | who |

Three points behind that shape:

- **The reason has to be specific.** "DNC — federal registry" and "the seller
  asked us to stop" are different facts with different durability. Federal DNC
  can expire off a list; a person's own request never does, and it's the one that
  matters most.
- **`wrong_number` needs its own slot.** It isn't DNC and isn't a seller request,
  but it's the commonest reason not to dial again. Without a slot for it people
  either mark it DNC — polluting real DNC data — or leave it and call twice.
- **Log the event, not just the state.** A boolean tells you the current state;
  it can't show that you honoured a request the day it was made. TCPA exposure
  runs $500–$1,500 per violating call or text, and if it's ever disputed what
  matters is demonstrating when you knew.

### `contact_emails`
Same shape, minus line type.

### `activities`
`pipeline_entry_id`, `contact_id`, `user_id`, `type`, `direction`, `outcome`,
`body`, `occurred_at`. Attributed by user — this is what stops two people dialling
the same seller.

### `tasks`
`pipeline_entry_id`, `assigned_to`, `title`, `due_date`, `status`,
`auto_generated`, `cadence_step`, `completed_at`, `completed_by`.

## 3. The cadence

A property entering `contacted` without reaching `qualified` gets a follow-up at
+7 days; completing that without a stage advance generates +14, then +30.

**Implemented as an explicit Postgres function called by RPC** — not a trigger,
not app code.

- A trigger is invisible: nothing at the call site says a task was created, and
  the next person to read the stage-change path won't know.
- App code can't make the task and the stage change atomic, so a failure between
  them silently drops a follow-up.
- An RPC is both: one statement, and the app calls it by name so a reader
  following the code finds it.

Cron handles only the overdue sweep the dashboard needs — the existing cron
migrations are the precedent.

A property in an active stage with zero open tasks is a defect condition and
appears on the dashboard.

## 4. Screens

### The pipeline — one list, not a board

**There is no kanban board, on either screen.** Owner's call, and it's the right
one. A board asks you to pick a column before it shows you anything, and the
column you want is almost never the one it opens on. Two layouts for one screen
was a cost I'd accepted; deleting the board removes it instead of paying it.

One fixed list. Every active lead, always visible, no stage to select first.

- Sorted by what needs attention: overdue tasks, then due today, then longest
  time in stage. The top of the list is the work.
- Each row carries the address, a stage badge, days in stage, and the next task
  with its due date. Stage is a property of the row, not a container it lives in.
- **Stage changes from a menu on the row, not a swipe.** Swipe-to-advance is
  undiscoverable and can't express the two moves that matter most — jumping
  straight to closed or dead from anywhere, and going backward when a deal
  stalls. A tap that opens a stage list handles all of it.
- Closed and dead are filtered out by default, reachable through a filter. They
  are the only thing the list hides.
- Desktop is the same list with more room, not a different screen.

Stage counts still need somewhere to live, since knowing where the pipeline is
bunched is genuinely useful. They go on the dashboard rather than above the list.

### Property detail
Core fields, contacts, activity log, tasks. Everything editable inline.

Phone numbers with a suppression reason render **struck through with the reason
visible**, not hidden. Hiding a number doesn't suppress the call, it just moves
the lookup somewhere nobody can flag it — an absent number is an invitation to go
find it on Whitepages. The tel link and the copy affordance are disabled.

**Stated plainly so nobody later assumes otherwise: the phase 1 UI treatment is a
warning, not the protection.** The actual control is phase 4's provider adapter
refusing the send server-side, regardless of what the interface allows.

### My tasks
Open tasks for the current user, due today and overdue first.

### Dashboard
Count by stage, tasks due, and the no-open-task defect list. Nothing else.

## 5. Build order

1. Migration: all tables, RLS, indexes, the cadence function.
2. Services in `lib/crm/`, unit-tested — stage transitions, cadence arithmetic,
   suppression rules.
3. Pipeline board, both layouts.
4. Property detail.
5. My tasks and dashboard.

## 6. Verification

- `npm run build` clean, Jest green.
- Playwright spec per CLAUDE.md rule, and mobile verified at ≤390px before
  anything is called done.
- The suppression rules and the cadence arithmetic get unit tests before any UI
  exists — they're the two places a quiet mistake is expensive.
