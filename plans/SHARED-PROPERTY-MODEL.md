# Shared Property Model

Decision doc, not a build plan. This is the schema call that blocks Cash Flow
Analysis phase 1 and the CRM phase 1, and it's the one that costs a migration on
live data if we get it wrong.

Read against `plans/CASH-FLOW-ANALYSIS.md`, `plans/MARKET-ANALYSIS.md`, and the
wholesaling CRM spec.

---

## 0. Two things to fix before this lands

**The wholesaling CRM spec is not in the repo.** It was discarded before it was
ever committed, so it isn't recoverable from git. I'm working from a copy held in
conversation. Everything below about CRM tables is derived from that copy and
should be checked against the real thing — paste it into
`plans/WHOLESALING-CRM-SPEC.md`.

**The CRM spec proposes a `workspaces` table.** It also says to check whether the
existing Team context already covers it and reuse rather than duplicate. It does.
The app already scopes every table with `owner_type` / `owner_id` resolved through
`resolveContext` (`lib/context.ts`), with team membership checked server-side. A
second workspace concept would be a parallel permissions system, and once both
exist every new table has to pick one — and the wrong pick isn't visible until
something leaks. **Recommendation: drop `workspaces` and `workspace_members`,
scope properties with `owner_type` / `owner_id` like everything else.**

The one thing workspaces would express that owner scoping doesn't is per-record
roles — a VA who can see leads but not buyers. That's a real gap, and it's also
explicitly out of the CRM's v1 scope ("two trusted users, both full access"). So
it's a reason to leave room for it, not to build it now. When it arrives it's a
role column on team membership, not a parallel table tree.

---

## 1. The problem

The owner's requirement: a property analyzed in Cash Flow Analysis must be able to
become a CRM property record, and the reverse. Property is one entity, not two
tables that happen to hold addresses.

But the two modules want different things from it:

- Cash Flow Analysis wants the *physical asset* — address, beds, baths, sqft — as
  context for a financial model. It's often speculative: a listing the owner is
  running numbers on, that he may never contact anyone about.
- The CRM wants a *lead* — stage, assignee, follow-up cadence, activity history,
  distress signals. Every row is something being worked.

Putting these in one table forces a bad choice. If analyses write into the CRM's
`properties` table, every speculative back-of-envelope run lands on the pipeline
board as a new lead. If they stay separate, the same house exists twice with no
link, which is what the owner asked us not to do.

## 2. The model

Split identity from pipeline state. Three tables where the CRM spec has one.

### `properties` — the shared entity

Physical facts and identity. No stage, no assignee, no workflow. This is what both
modules point at.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| owner_type | text | 'personal' \| 'team', per `resolveContext` |
| owner_id | uuid | |
| address_line1 | text | required |
| city, state, zip | text | state defaults 'GA' |
| county | text | |
| parcel_number | text nullable | the real dedupe key |
| address_hash | text | normalized fallback key, always written |
| needs_address_review | boolean | set on a fuzzy match — see §4 for how it clears |
| origin | text | manual, analysis, import, inbound_web, crm — where the property first came from |
| property_type | text | single_family, multi_family, condo, townhouse, land, mobile, other |
| beds, baths | numeric nullable | |
| sqft, lot_sqft, year_built | int nullable | |
| latitude, longitude | numeric nullable | |
| description | text nullable | |
| photo_url | text nullable | |
| created_by | uuid fk | |
| created_at, updated_at | timestamptz | |

The CRM's phase-2 vendor fields (`estimated_value`, `mortgage_balance`,
`tax_delinquent_amount`, `is_absentee`, `vacancy_flag`, and the rest) append here
when phase 2 arrives. They're facts about the house, not about the lead.
`property_distress_signals` hangs off `property_id` for the same reason.

### `pipeline_entries` — the CRM's lead state

What the CRM spec called the workflow half of `properties`.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| property_id | uuid fk | |
| owner_type, owner_id | | mirrors the property, for RLS without a join |
| stage | text | new_lead → contacted → qualified → offer → under_contract → closed / dead |
| assigned_to | uuid fk | |
| source | text | manual, import, inbound_web, analysis |
| created_by | uuid fk | |
| created_at, updated_at | timestamptz | |

`property_stage_history`, `tasks`, and `activities` reference `pipeline_entry_id`
rather than `property_id` — they're facts about working the lead, and a property
that recycles later gets a second pipeline entry without inheriting the first
one's history. `property_contacts` stays on `property_id`, since ownership is a
fact about the house.

Unique constraint: one active pipeline entry per property per owner. A dead lead
that gets revived reuses its entry, per the CRM spec's revive requirement.

### `analyses` — Cash Flow Analysis

Exactly as `CASH-FLOW-ANALYSIS.md` §6 specifies — inputs only, derived outputs
never stored — with one change: the property fields in §4.1 move out.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| owner_type, owner_id | | |
| property_id | uuid fk | **not null** |
| ...all purchase / financing / income / expense / growth inputs | | |
| archived_at | timestamptz nullable | archive, never hard-delete |

## 3. How the two directions work

**Analyze → CRM.** Saving an analysis upserts a `properties` row (§4) and links to
it. No pipeline entry is created. The property exists; it just isn't a lead.
"Add to pipeline" on the analysis creates a `pipeline_entries` row at `new_lead`
with `source = 'analysis'`. One button, no data migration, nothing speculative
leaks onto the board.

**CRM → analyze.** "Run the numbers" on a pipeline entry creates an analysis
pre-filled from the property's known fields, pointed at the same `property_id`.

**Many analyses per property, deliberately.** A house gets re-run as repair
estimates firm up and offers move, and the second run must not overwrite the
first — comparing them over time is the point. So `analyses.property_id` is a
plain foreign key with no uniqueness, the property detail view lists every
analysis against it newest first, and "run the numbers" on a property that already
has one offers to duplicate the most recent rather than starting blank.

**Attribution.** `pipeline_entries.source` records how a *lead* arrived, but a
property created by an analysis may never become a lead, which leaves a hole in
cost-per-lead reporting. So `properties.origin` records where the *property* came
from, independently. The two answer different questions and the CRM's attribution
reporting needs both.

The consequence worth stating plainly: **a property row is not a lead.** That
distinction is what makes both directions cheap and stops the pipeline filling
with houses nobody is working.

## 4. Dedupe

Per the owner: parcel number where available, address as fallback.

```
unique (owner_type, owner_id, parcel_number) where parcel_number is not null
index  (owner_type, owner_id, address_hash)
```

Parcel is a real unique constraint. Address hash is **not** — normalization is
lossy and a false merge is worse than a duplicate. On an address-hash match the
upsert reuses the existing row and sets `needs_address_review = true`, which is the
CRM spec's "flag the record for review" behaviour.

**How the flag clears.** A state nobody surfaces is dead weight, and a fuzzy match
that silently reuses a row is exactly the failure this flag exists to catch. So it
gets a UI: a badge on the property record with two actions — *confirm* (same
house, clear the flag) and *split* (different house, move the incoming data to a
new row). Anything flagged also filters on the properties list, so a batch of
fuzzy matches from an import is reviewable in one pass rather than discovered
one record at a time.

If we decide the badge isn't worth building for phase 1, then the flag comes out
entirely and the hash match just works silently. What we don't do is store it and
never look at it.

`address_hash` is written by one shared normalizer in `lib/property/`, used by the
analysis save path, the CRM manual-create path, the PropStream import, and the
Phase 5 web form. Four call sites, one function — if they diverge, dedupe silently
stops working. Not a Postgres generated column: normalization needs USPS-style
suffix and directional handling that doesn't belong in a column expression.

## 5. Sequencing

The `properties` and `analyses` tables have to land together, in one migration,
before Cash Flow Analysis phase 1 ships. `pipeline_entries` can come with CRM
phase 1 — but the `properties` shape has to be right now, because that's the part
a later migration would have to rewrite on live rows.

Market Analysis is untouched by all of this. Its `markets` table is metro-level and
has no property relationship; the spec's non-goals put deal-level analysis outside
it deliberately. The only thing it shares is the FRED client (§6 below).

## 6. Shared code

- **Amortization.** `lib/mortgage/` already has a tested engine — 132 tests,
  checked against an outside reference. Cash Flow's loan balance and equity rows
  consume `buildAmortizationSchedule`. It already returns per-period balance, so I
  expect no signature change; if the projection needs an annual roll-up,
  `toAnnualRows` covers it. Nothing gets forked.
- **FRED.** One client in `lib/fred/`, used by the mortgage rate lookup and Market
  Analysis phase 4. The current fetch lives in `app/api/mortgage/rates/route.ts`
  and moves there when the second consumer arrives. The retired-MSA-series caution
  from `MARKET-ANALYSIS.md` §7 belongs in that client, not in a comment in one
  route — validate a series is live before trusting it, and prefer summing county
  series over an MSA series that may be frozen.

## 7. Open questions

1. **Market Analysis saveability.** The owner said it must be saveable after it's
   run. The spec already persists market *records*. Does he mean that — or saving
   the output of a scoring run and comparison as a snapshot he can return to?
   Those are different schemas: the second needs a `market_snapshots` table
   capturing the weights and the ranked result at a point in time. Not guessing.

2. **Scoring weights have nowhere to live.** `MARKET-ANALYSIS.md` §3 says one
   table; §6 says weights persist per user. Needs a second table or a settings row.
   Recommendation: a `market_scoring_weights` row per user, keyed on
   `owner_type` / `owner_id`, defaulting to the §6 table. Decide now, not at
   phase 3.

3. **`is_local_baseline` is a should, not a constraint.** Add
   `unique (user_id) where is_local_baseline` so it can't drift to two rows.

4. **Charting library.** Held until this is settled, per instruction. Short
   version: `recharts` is the obvious candidate and it's already available to the
   React artifact environment, but it is not currently a dependency of this repo
   and it is not small. I'll come back with a real bundle-cost comparison against
   the alternatives rather than adding anything now.
