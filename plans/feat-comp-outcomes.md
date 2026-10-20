# Plan: record what actually happened to each removed comp

Status: **ON HOLD** (2026-10-20). Approved, then superseded before any code
was written. Nothing here has been built.

**Why it is on hold.** This feature exists to let the owner hand-resolve what
happened to a removed listing, because RentCast could not say. One live
`/properties` call on 1653 Sylvan Rd SW then showed that county records
supply real closed sale prices directly, so the project moved to recorded
sales as the source of comps: `plans/feat-recorded-sales.md`. Typing an
outcome by hand is the manual version of a job the county record now does
on its own.

**What it is still good for, if it comes back.** Recorded sales do not cover
everything. A listing that came off the market last week will not be in the
county data for months, and the deed never explains *why* a house failed to
sell. The off-market ceiling warning designed here — "somebody already tried
this price on a similar house nearby" — has no equivalent in
`feat-recorded-sales`, and is the strongest single idea in this plan. If
this is revived, that is the part to revive first.

Do not build from this file without a fresh decision. The rest of it is
preserved below as written.

---

Originally: **User approved** (2026-10-20), as written plus the decisions
below. RentCast requests this feature will ever spend: **0**.

Decisions taken at approval:
- Separate `outcome` columns. `property_comps_sold_is_manual` stays exactly
  as it is.
- Switching Sold → Taken off market clears the sale price.
- The outcome control appears on removed comps only.
- The migration is written and NOT run; the owner will say when.
- A confirmed sale dated more than 12 months ago is flagged on the comp and
  under the ARV.

Build this only after `fix/comps-accuracy` is merged. One branch at a time;
branch `feat/comp-outcomes` off an updated `main`.

## Goal

Every automatic ARV in this app is a median of asking prices. RentCast can
only say a listing went inactive — not whether it sold, and not for how much.
The owner can find that out (agent, Redfin, county records) but today has
nowhere to put it except by retyping the whole comp by hand.

This lets the owner mark each removed comp with what actually happened and
rebuilds the ARV from those answers. It converts the one thing the API cannot
give us — real sale prices — into the thing the ARV is built on, at a cost of
zero requests.

## Stack

TypeScript (strict) and Tailwind, the project default. SQL for the migration,
which is the one unavoidable exception and is the usual one for schema work.
No new packages.

## Scope — files that change

| File | Change |
|---|---|
| `supabase/migrations/<ts>_comp_outcomes.sql` | **new.** Columns + constraints. Written, NOT run. |
| `lib/supabase/database.types.ts` | regenerated after the migration runs (`npm run db:types`) |
| `lib/comps/types.ts` | `CompOutcome` type, outcome fields on `Comp`, labels |
| `lib/comps/compService.ts` | map new columns; `setCompOutcome()`; protect them in `saveRentCastComps` |
| `lib/comps/arv.ts` | effective price/status, the off-market ceiling, the new warnings |
| `app/api/properties/[id]/comps/[compId]/route.ts` | extend the existing PATCH |
| `components/crm/CompsPanel.tsx` | the "Removed, similar size" view and the outcome control |
| `tests/unit/arv.test.ts` | ARV rules |
| `tests/unit/compOutcome.test.ts` | **new.** Validation of the outcome input. |
| `tests/26-comp-outcomes.spec.ts` | **new.** Playwright at 390px. |

Two new test files are named here because `tests/23-comps.spec.ts` is already
52 tests and CLAUDE.md asks that tests not be scattered into unrelated files;
a sibling spec is the existing convention (`23-`, `25-`).

## The data model

### Why `status` does not change

The obvious move is to let a RentCast comp carry `status = 'sold'` and relax
`property_comps_sold_is_manual`. **Recommendation: don't.** That constraint is
the one thing standing between an asking price and an ARV that treats it as a
sale, and weakening it to add a feature trades a safety rule for convenience.

Instead `status` keeps meaning *what RentCast reported* and a new `outcome`
column means *what the owner established*. Same shape as requirement 3 for
prices: keep the API's fact and the person's fact side by side rather than
overwriting one with the other. The existing CHECK is left exactly as it is.

**This directly answers the question in the brief** — the `sold requires
source = 'manual'` CHECK does not change, because nothing will ever write
`status = 'sold'` onto a RentCast row. The "only a person can confirm a sale"
rule is re-stated on the new columns instead, where it is enforced the same
way:

```sql
CONSTRAINT property_comps_outcome_sold_needs_proof
  CHECK (outcome <> 'sold' OR (outcome_price IS NOT NULL AND outcome_set_by IS NOT NULL))
```

A sale needs a price and a named person. A row cannot claim one without both.

If the Approver prefers the other route (relax the old CHECK, write `status`
directly), say so at review — it is a smaller diff in `arv.ts` and a larger
risk everywhere else, and the two are hard to swap later once data exists.

### Columns added to `property_comps`

| Column | Type | Notes |
|---|---|---|
| `outcome` | `text NOT NULL DEFAULT 'unknown'` | `CHECK (outcome IN ('sold','off_market','unknown'))` |
| `outcome_price` | `numeric` | `CHECK (outcome_price IS NULL OR outcome_price >= 0)` |
| `outcome_date` | `date` | optional, even for a sale |
| `outcome_set_by` | `uuid REFERENCES auth.users(id)` | who said so |
| `outcome_set_at` | `timestamptz` | when |

Constraints beyond the one above:

```sql
-- Any answer other than the default was given by a person.
CHECK (outcome = 'unknown' OR outcome_set_by IS NOT NULL)
-- A sale price only means anything on a sale, so switching away clears it.
CHECK (outcome_price IS NULL OR outcome = 'sold')
```

`DEFAULT 'unknown'` means every existing row is already correct and the
migration needs no backfill.

**Decision to confirm:** the third constraint makes switching Sold → Taken off
market clear the sale price rather than keep it parked. Clearing is
recommended — a price sitting on a row that is not a sale is the kind of stale
data that later gets read as one — but it does mean re-typing the price if the
owner flips back.

**Open question for the owner:** the brief scopes this to removed comps, and
the UI will only offer it there. The columns are deliberately not restricted
to `status = 'removed'`, so an active listing could be marked sold later
without another migration. Say if it should be locked down instead.

## Approach, in order

Each step is one commit.

1. **Migration, written not run.** Columns, constraints, and a comment block
   explaining why `status` was left alone. Nothing else in this commit.
2. **Types.** `CompOutcome = 'sold' | 'off_market' | 'unknown'`, the five
   fields on `Comp`, and `COMP_OUTCOME_LABELS` for the screen.
3. **Service.** `toComp` maps the new columns. New `setCompOutcome(compId,
   input, ctx, userId)` validates and writes, stamping `outcome_set_by` from
   the session — never from the request body.
4. **Protect them from a refresh.** Requirement 5. See below.
5. **ARV.** Effective price and status, the off-market ceiling, the new
   warning, the confirmed-sale count.
6. **API.** Extend the existing PATCH.
7. **The comps section of the ARV tab.** The filtered view and the outcome
   control.
8. **Tests.** Unit, then the Playwright spec at 390px.

### Step 4: a refresh must never overwrite an answer (requirement 5)

`saveRentCastComps` updates an explicit field list and already leaves
`included` alone for exactly this reason. The five outcome columns are simply
not added to that list, so a refresh cannot touch them.

Worth stating plainly: `price` **stays** on RentCast's update list. That is
correct and is requirement 3 — `price` is RentCast's asking price and should
keep tracking RentCast; `outcome_price` is the owner's and is never written by
any automatic path. A comp can therefore show a fresh asking price beside a
sale price from three weeks ago, which is the honest picture.

A unit test will pin this: run `saveRentCastComps` over a comp carrying an
outcome and assert all five columns survive unchanged.

### Step 5: the ARV rules (requirement 4)

In `calculateArv`:

- **Effective price.** `outcome === 'sold' ? outcome_price : price`. The size
  adjustment then runs on that figure exactly as it does today.
- **Effective status.** A comp with `outcome === 'sold'` counts as a confirmed
  sale for every purpose `status === 'sold'` has today, including
  `SOLD_ONLY_THRESHOLD` — so two confirmed outcomes flip the whole ARV onto
  sales alone and the listings drop out.
- **Taken off market.** Removed from the median entirely. Not evidence of
  value: a house that failed to sell says what the market *refused*, which is
  a ceiling, not a comparable.
- **The ceiling warning.** For each off-market comp, size-adjust its last
  asking price to the subject the same way every other comp is adjusted. If
  the ARV lands above the **lowest** of those, warn — a nearby house could not
  find a buyer below the number we are claiming this one is worth. Proposed
  wording:

  > This ARV is $12,000 above 1815 Windsor Dr, which was asking $265,000 and
  > did not sell. Somebody already tried this price on a similar house nearby.

- **Not sure yet.** Byte-for-byte today's behaviour.
- **Say what was confirmed.** `basisLabel` gains "3 sales you confirmed" so
  the owner's own work is visible rather than folded into "3 sold".
- **A stale sale is still a sale, but say so.** When a confirmed sale's
  `outcome_date` is more than 12 months old, flag it in two places: on that
  comp's own card, and once under the ARV. It stays in the median — it is
  real evidence and dropping it would be worse — but a year-old price is
  priced by a market that has moved, and there is no time adjustment anywhere
  in this file to correct for it. Proposed wording:

  > On the comp: *Sold Mar 2025 — over a year ago, so the market has moved
  > since.*
  >
  > Under the ARV: *2 of the 3 sales behind this number are over a year old.
  > Prices have moved since, and nothing here adjusts for that.*

  A sale with no date recorded is not flagged — unknown is not the same as
  old, and guessing would put a warning on good evidence.

`ArvResult` gains `confirmedSaleCount`, `ceilingWarning` and `staleSaleCount`.
All additive; no existing field changes meaning.

The 12-month threshold is a named constant beside `COMP_ELIGIBILITY`, not a
literal buried in a comparison.

### Step 6: the API

`PATCH /api/properties/[id]/comps/[compId]` already exists and handles
`included`. It gains an optional `outcome` block rather than getting a second
route beside it. Validated at the boundary:

- `outcome` must be one of the three literals.
- `outcome === 'sold'` requires a finite `outcomePrice > 0`, else a 400 saying
  which field and why.
- `outcomeDate` takes `YYYY-MM-DD` or null, reusing `isoDateOrNull` from the
  sibling comps route.
- Anything else → `outcome_price` and `outcome_date` are written as null.
- `outcome_set_by` comes from the session. A client cannot name someone else.

Clearing (requirement 6) is `outcome: 'unknown'`, which nulls the price and
date and is the same code path.

### Step 7: the comps section of the ARV tab, at 390px

There is no Comps tab. The comps live in the comps section of the **ARV** tab
— `PropertyDetailPage` renders `<CompsPanel>` when `tab === "ARV"`, and the
tab's testid is `tab-arv`. Anything that opens this screen, in a test or in a
link, goes through the ARV tab.

A collapsed section above the full comp list:

> **Removed listings about this size · 6**
> These came off the market. Finding out whether they actually sold is the
> single best thing you can do to this number.

Contents: comps with `status === 'removed'` within
`COMP_ELIGIBILITY.sqftTolerancePct` of the subject, sorted by absolute size
difference ascending — closest first, per requirement 1. Reuses the existing
constant; no second tolerance.

Each row, stacked vertically because 390px cannot hold a row of controls:

- address, then `Asked $345,000 · Sold $331,000` when both exist
  (requirement 3), on its own line so neither number is clipped
- a `<select>` labelled **What happened?** — Not sure yet / Sold / Taken off
  market. A native select, which is the right control on a phone.
- choosing **Sold** reveals a price field (required, inputMode numeric) and an
  optional date field, full width, stacked
- a **Clear** action when an outcome is set

Empty state, per the writing rules: "No removed listings near this size yet.
Refresh the comps, or add a sold comp by hand from your agent's list."

Jargon: the ⓘ on "comps" already exists and is reused. "Asking price" gets one
— "What the seller wanted. Not what anyone paid."

No internal words on screen: not "outcome", not "status". The control says
"What happened?" and the answers are in plain English.

## Refactors rather than new code

- The PATCH route is **extended**, not duplicated.
- The size-tolerance filter reuses `COMP_ELIGIBILITY.sqftTolerancePct`.
- The size adjustment for the ceiling warning reuses the existing adjustment,
  not a second copy of the arithmetic.
- `isoDateOrNull` moves from `comps/route.ts` to a shared spot so both routes
  use one validator. Flagged below as a cross-file move.
- `CompRow` gains the control; it is not forked into a second component.

## Risks — everything here is Tier 2

- **Migration.** Written, not run. It needs owner approval to run, separately
  from approving this plan. `database.types.ts` cannot be regenerated until
  it has run, so steps 2 onward do not typecheck until then — the branch will
  sit incomplete between those two moments. Worth deciding up front whether to
  run it early on a branch or hold the whole feature.
- **Relaxing a safety constraint.** The recommendation avoids this. If the
  Approver prefers the alternative, it should be re-reviewed as its own risk.
- **`calculateArv` behaviour changes for existing data.** Every house with
  comps gets its ARV recomputed. With no outcomes recorded the result is
  unchanged by construction, and a unit test will assert exactly that.
- **Public interface change.** The PATCH body grows. Backwards compatible —
  `included` alone keeps working — but it is still a contract change.
- **Moving `isoDateOrNull`** touches a file otherwise unrelated to this work.
- **New files.** Two test files and one migration, named above with reasons.

## Testing

**Unit (`tests/unit/arv.test.ts`)**
- no outcomes recorded → ARV identical to today (the regression guard)
- one `sold` outcome → counted at `outcome_price`, not `price`
- two `sold` outcomes → sold-only takes over, listings drop out
- `off_market` → out of the median
- ARV above the lowest adjusted off-market asking → warning, naming the house
- ARV below it → no warning
- `basisLabel` says how many sales the owner confirmed
- outcome `sold` with a null price → treated as unconfirmed, never as $0
- a sale dated over 12 months ago → still in the median, flagged on the comp
  and counted under the ARV
- a sale dated inside 12 months → no flag
- a sale with no date → no flag, because unknown is not the same as old

**Unit (`tests/unit/compOutcome.test.ts`)**
- each invalid payload rejected with a message naming the field
- `saveRentCastComps` leaves all five columns untouched on a refresh

**Playwright (`tests/26-comp-outcomes.spec.ts`, 390px, stubbed)**

Opens the screen with `page.getByTestId("tab-arv").click()`, never
`tab-comps` — that testid does not exist and is what left the comps suite
silently red for so long. Copy `openCompsTab` from `tests/23-comps.spec.ts`
rather than writing a second version of it.

- the section lists only removed comps near the subject size, closest first
- marking Sold with a price moves the ARV and shows both numbers
- Taken off market drops it from the median and can trigger the warning
- the outcome survives a refresh
- clearing returns the ARV to its previous figure
- no horizontal scroll at 390px, and no control narrower than 44px

**State of the comps suite, now diagnosed.** `tab-comps` was renamed to
`tab-arv` and the specs were never updated, so all 52 tests timed out before
reaching the panel. Fixed on `fix/comps-accuracy`: 41 of 52 now pass.

The remaining 11 are pre-existing and fail identically on `main` — their
expectations predate the price-per-sqft → price-adjustment rewrite and the
eligibility filter, both already merged. They are **not** this feature's work,
but they do sit on the screen this feature changes, so expect to be editing
tests whose baseline numbers are already wrong. Worth clearing them first on
their own branch.

## Out of scope

- Pulling sale prices automatically from county records — that is Phase 2 of
  `plans/fix-comps-accuracy.md` and spends requests.
- Any per-market or condition adjustment to the $40/sqft rate.
- Outcomes on active listings in the UI (the columns allow it; the screen
  will not offer it).
- Backfilling outcomes for comps already stored.

## Done when

An ARV on a house with two confirmed sales is built from those sales at the
owner's prices, says so on screen, and survives a refresh. A house that failed
to sell below the ARV produces the ceiling warning naming that house. The
migration is written and not run. `tsc` and `npm run build` pass, the unit
tests pass, and the Playwright spec passes at 390px.
