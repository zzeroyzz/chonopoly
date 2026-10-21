# Plan: when you cannot tell, say so

Status: **Changes requested** — 2026-10-21 (self-review). No code written.
Branch: `feat/comp-cant-tell`, cut from `1eefcd6` (the PR #58 merge, tip of main).
RentCast requests: **0**.
Follows: `plans/feat-arv-review-flow.md`, which called this Stage B.

## The problem

Three gaps left by Stage A, and one found while planning this.

**1. A removed listing often takes its photos with it.** The review then forces
a guess between "it counts" and "leave it out", and both move the resale price
on no evidence. There is no way to say *the photos are gone and I cannot tell*.

**2. There is nowhere to write down what you saw.** Come back in a week and
your own decision is unexplained. Stage A shipped without the notes field
because `notes` was already taken — `CompLinks` reads it as the listing URL on
hand-entered comps.

**3. An accepted offer has nowhere to go.** A house under contract is the
closest thing to a sale that has not closed, and the app can only call it
Active or Removed, both of which are wrong.

**4. Found while planning: every comp is in the review queue, including the
active ones.** `review` defaults to `needs_review` on every row whatever its
status, and `compReviewOptions` offers review choices for an active listing.
So the owner is asked "was it fixed up like yours will be?" about a house that
has not sold — a question with no answer, about a price that is an opinion.

That is where "81 to go" comes from. An active listing is **not a chore**; it
is context. The design system has said so since the rebuild
(`status-and-verdicts.md`, "Active is just active") and the code never did it.

## Goal

A sixth answer for when the evidence is gone, somewhere to write what you saw,
Pending as a real status, and a review queue holding only houses that can
actually be judged.

## Stack

TypeScript strict, Tailwind utilities, tokens from `globals.css`. No new
dependencies. SQL for the migration, the named exception.

Read `node_modules/next/dist/docs/` before touching component code. This repo
runs Next 16.2.4 and React 19.2.4.

## Sequencing — read before anything else

`database.types.ts` is generated. Code reading `review_notes`, `cant_tell_skip`
or `pending` does not typecheck until the migration has run and the types have
been regenerated.

Stage A proved the loop works: `20261020200000` and `20261020220000` were both
run, the types carry their columns, and the "WRITTEN, NOT RUN" banners were
simply stale. So:

> **The migration is written, the owner runs it, the owner regenerates the
> types, and only then does the code begin.** `database.types.ts` is not
> hand-edited ahead of it — a generated file edited by hand is a lie that
> survives until the next regeneration.

Nothing in this plan is a reason to run anything. That is a separate
instruction, from the owner, in their own words.

## The migration — proposed, not yet written

`supabase/migrations/<ts>_comp_cant_tell_notes_pending.sql`

Four changes, in one migration because they share a table and a lock:

**1. A sixth review value.** `cant_tell_skip`. Skips arithmetically like the
other three; kept apart because it records a different judgement and is the
only one the resale price has to mention out loud.

**2. `review_notes text`.** Not `notes`, which `CompLinks.tsx:71` reads as the
listing URL on hand-entered comps (`comp.notes?.startsWith("http")`). Writing
review notes there breaks the link on exactly the comps typed in by hand.

**3. `pending` joins the status CHECK**, currently
`status IN ('active','removed','sold')` from `20261019010000`.

**4. Pending needs evidence, like sold does.** `20261020120000` already
enforces `status <> 'sold' OR source IN ('manual','public_record')`. Pending
gets the same shape: RentCast reports only Active and Inactive
(`lib/rentcast/types.ts`, `fromRentCast.ts:22`), so a sync can never learn that
a listing went under contract, and the database should not let it claim so.

Structure follows `20261020220000`: baseline temp table, every CHECK looked up
**by definition rather than by name**, dropped, re-added, then a verify block
that fails the transaction if the end state is wrong, and a commented-out Down.

**With the guard the last Approver asked for:** `property_comps` now carries
several CHECKs mentioning `status` or `review`, and `SELECT … INTO` takes an
arbitrary row when more than one matches. Each lookup counts its matches and
raises unless exactly one.

## Approach

### 1. Active and Pending leave the review queue

The largest change by effect and the smallest by diff.

- `compReviewOptions("active")` and `compReviewOptions("pending")` return
  **no reviewable options**. There is nothing to judge: the price is an ask.
- Those comps do not appear in **Still to check** and do not add to its count.
- They appear under the filter's **Listings**, with their status sentence —
  *"Still on the market, so this is an ask, not a sale. It isn't in your resale
  price."*
- `arv.ts`'s `stillToReview` counts only comps that can be reviewed, so
  *"Review comps to get an ARV. 81 to go."* stops overstating the work.

**This changes a number the owner has already seen.** The count will drop,
perhaps a lot. That is the fix, not a regression, and the PR must say so.

### 2. The sixth answer

`cant_tell_skip`, offered on **removed listings only** — an active listing's
photos being gone is not a thing, and `compReviewOptions` already gates
`took_off_market_skip` the same way.

Label, which must say what it does as well as what it is:

> `"Photos are gone — can't tell. Left out of the resale price."`

### 3. It is reported, not just counted

A resale price built from four houses where two more were unreadable is a
different number from one built from four out of six, and the owner should see
that without going looking.

`ArvResult` gains `unreadable: number`, populated beside `stillToReview` at
`arv.ts:613-630`. The arithmetic does not change — a skip is a skip. The basis
line gains a clause:

> *"Built from 4 comps you approved. 2 more sold but had no photos left, so
> they were left out."*

`ArvResult` is a public type; its call sites are in scope below.

### 4. Notes

A plain multi-line field on the review card, saved with the answer, one line of
help: *"What you saw. Only you and your team see this."*

- **`Later` discards anything typed**, because the PATCH route needs a valid
  `review` and notes cannot be saved alone. The button says so.
- Notes show on the Checked rows, so a decision can be re-read.
- `setCompReview` carries them. Its signature gains a field — Tier 2, and this
  repo's own rule: *never change function signatures without checking all call
  sites.* Notes join `sale` as an options object rather than a sixth
  positional.

### 5. Pending

- A status pill in `--color-under-contract` blue, its own ink and edge like the
  others.
- *"Under contract. The price isn't final, so it isn't in your resale price
  yet."*
- Not reviewed, not counted — see §1.
- **Settable by hand**, which is the only way it can ever be set. The manual
  comp form currently hard-codes `status: "sold"` (`CompsPanel.tsx:1096`); it
  gains a choice between Sold and Pending, because an agent's list carries
  both.

## Scope — every file

| File | Change |
|---|---|
| `supabase/migrations/<ts>_…sql` | **new**, written and NOT run |
| `lib/comps/types.ts` | `cant_tell_skip`, `pending`, labels, `compReviewOptions`, `Comp.reviewNotes` |
| `lib/comps/compService.ts` | `CompRow`, `toComp`, **`setCompReview` signature** |
| `app/api/properties/[id]/comps/[compId]/route.ts` | accept the value and the notes |
| `app/api/properties/[id]/comps/route.ts` | accept `pending` on a hand-entered comp |
| `lib/comps/arv.ts` | `unreadable` on `ArvResult`; `stillToReview` excludes unreviewable |
| `lib/supabase/database.types.ts` | **regenerated by the owner**, not edited |
| `components/crm/CompReviewCard.tsx` | notes field, the sixth option, Pending pill and sentence |
| `components/crm/CompsPanel.tsx` | basis line, notes on rows, manual form status choice |
| `components/crm/CompControls.tsx` | counts exclude unreviewable comps |
| `tests/unit/arv.test.ts` | the new counting and the new state |
| `tests/23-comps.spec.ts` | see Testing |

**Broken by adding `reviewNotes` to `Comp`** — `tsc` finds all of them:
`scripts/review-reset.ts`, `scripts/diagnose-comps.ts`,
`tests/27-recorded-sales.spec.ts`, `tests/unit/screenRow.test.ts`,
`tests/unit/arv.test.ts`, `tests/23-comps.spec.ts`.

**Reads the basis line:** `components/crm/PropertyDetailPage.tsx` and
`components/properties/PropertiesPage.tsx` each compose their own "Built from N
comps you approved" sentence. **Assumption, as in Stage A:** the unreadable
count appears on the ARV card only. Saying it in three places triples the
surface for one fact.

## Refactors

- `COMP_REVIEW_SKIPS` already derives from `COMP_REVIEW_ORDER`, so
  `cant_tell_skip` becomes a skip with no second edit. That was the point of
  `e5eb59f`.
- `STATUS_STYLE` and `STATUS_MEANING` are single definitions in
  `CompReviewCard.tsx`; Pending is one entry in each.
- `compReviewOptions` is the one place that decides what may be answered, so
  §1 and §2 are both edits to it.
- Nothing is deleted.

## Risks — every Tier 2 action

- **A migration is written. Not run.** Needs its own instruction.
- **One new file**, the migration.
- **`setCompReview`'s signature changes.** Call sites checked before the edit.
- **`ArvResult` gains a field** — public type.
- **`CompStatus` gains a member.** `COMP_STATUS_LABELS` and `STATUS_STYLE` are
  `Record<CompStatus, …>` so `tsc` finds those, but **these are silent**:
  - `compReviewOptions` (`types.ts:61`) — a `status === "removed"` ternary
  - `matchesFilter`'s `listings` case — `comp.status !== "sold"`, which already
    includes pending by accident rather than intent
  - `fromRentCast.ts:22` — maps everything not inactive to active, correctly,
    and must keep doing so
- **`CompReview` gains a member.** `COMP_REVIEW_ORDER` is the API validator:
  miss it and the route 400s the new value with a clean build.
- **The review count the owner has seen will drop** (§1). Intended.
- No change to auth, RLS, env, CI, lockfiles, or any Plaid path.

## Testing

**Unit** — `tests/unit/arv.test.ts`:

1. `cant_tell_skip` keeps a comp out of the resale price
2. the unreadable count reports it, and is zero when none
3. an active comp is not counted as still-to-review
4. a pending comp is not counted as still-to-review
5. `compReviewOptions` offers nothing for active or pending
6. `cant_tell_skip` is offered on removed and nowhere else
7. `COMP_REVIEW_SKIPS` picks the new value up without a second edit

**Playwright** — the suite is **commented out in `.github/workflows/ci.yml`**
("TEMPORARILY DISABLED — tests still being fixed"), and 8 of 55 in
`tests/23-comps.spec.ts` fail on main today, five of them asserting ARV figures
or basis text — which is exactly what §3 changes.

**OWNER — decided 2026-10-21: deferred again**, on the grounds that the CI job
is off regardless. Carried forward from Stage A.

The cost of that, recorded so it is not a surprise later:

- `tests/23-comps.spec.ts:432-477` drives `comp-review-comp-4-option-*` on the
  default Needs-review view. **That view no longer exists** — Stage A replaced
  it with the one-card flow. Those tests were named in the Stage A plan as
  needing a deliberate rewrite, and the rewrite did not happen.
- So the failure count is **no longer the 8 measured against main before Stage
  A**. It is higher, and nobody has measured it. The number in this plan and in
  PR #58 is stale the moment Stage A merged.
- Each deferred feature puts more distance between the suite and the UI,
  which makes re-enabling the CI job a bigger job than the last time anyone
  looked at it.

None of that is an argument against the decision — it is the bill, and it is
being deferred too, not avoided. Re-enabling the job and getting the suite
green is its own branch, named under Out of scope.

**Gate:** `npm run build`, `tsc --noEmit`, `npm run test:unit`.

## Out of scope

- Team sharing — needs RLS work.
- Verdict levers on the Deal tab.
- Re-enabling the Playwright job in CI, and the 8 failures behind it. Its own
  branch; naming it here does not fix it.
- Splitting `23-comps.spec.ts`, now 1,159 lines.
- `cashReservesTightMonths` 3 → 6.

## Approver

**2026-10-21 — Changes requested.**

**This is a self-review.** The implementer wrote this plan and reviewed it, at
the owner's standing instruction. It is not the independent review the repo's
`CLAUDE.md` describes, and nobody reading this later should take it for one. A
self-review can check facts against code, which is what follows. It cannot
judge whether the design is right, because the same assumptions produced it.

### 1. BLOCKING — an undeclared dependency between §1 and §5

`lib/comps/arv.ts:692-694` counts the basis by status, in three explicit
branches:

```ts
const soldCount    = basis.filter((c) => c.status === "sold").length;
const removedCount = basis.filter((c) => c.status === "removed").length;
const activeCount  = basis.filter((c) => c.status === "active").length;
```

A `pending` comp in `basis` is counted in **none** of them, and the basis line
undercounts with a clean build. `tsc` cannot see it.

It cannot happen *as long as §1 lands*: `basis` is built from approved comps,
and §1 makes a pending comp unapprovable. So the two changes protect each
other — and the plan never says so. **Write the dependency down.** If §1 is
ever dropped, deferred or reverted, §5 becomes a live undercount, and the next
person needs to know these two cannot be separated.

Either add a fourth count, or state in the plan that `pending` is
unreachable here *because* of §1, and say which.

### 2. BLOCKING — §1 changes a number on a screen the plan does not name

`lib/screen/screenRow.ts:236` reads it directly:

```ts
const compsToReview = arvResult.stillToReview;
```

Changing `stillToReview` to exclude unreviewable comps therefore changes what
the Screen table shows for every house, not just the ARV tab. That is the
intended fix and it is still a change to another screen, which makes
`screenRow.ts` a file this work affects. **It is not in the scope table.**

It probably needs no edit — it passes the value through. "Probably" is the
problem: the scope table is the list of what a reviewer and the owner are
agreeing to, and a behaviour change on another page belongs in it.

### 3. `compDate` has no branch for pending

`lib/comps/format.ts:167-171` maps sold and removed to `removedDate` and
everything else to `listedDate`. A pending comp falls through to
*"Listed Mar 2026"*, which is true but not the useful date — the useful one is
when it went under contract, which nothing records.

Not a bug; a gap worth a decision in writing. "Listed" is honest and the plan
should say that is deliberate.

### 4. The migration's four changes in one transaction — correct

Judged and accepted. They share a table and a lock, and the Pending constraint
is only meaningful once the status CHECK admits `pending`, so splitting them
would create a window where one is applied and the other is not. That is the
exact failure a transaction prevents.

**One ordering requirement to state explicitly:** the status CHECK must be
widened *before* the `pending`-needs-evidence constraint is added, inside the
same transaction. The plan lists the four changes without saying they are
ordered.

### Verified as the plan claims

- Every comp does default to `needs_review` whatever its status, and
  `compReviewOptions` (`types.ts:61-71`) does offer review options to an active
  listing. **§1 is real**, and it is the highest-value item here.
- `status IN ('active','removed','sold')` is at
  `20261019010000_comps_valuations_usage.sql:57`, and
  `status <> 'sold' OR source IN ('manual','public_record')` at
  `20261020120000_recorded_sales.sql:82`. The Pending constraint mirrors a
  shape that already exists.
- `CompLinks.tsx` does read `comp.notes` as a listing URL, so `review_notes`
  is still justified.
- `COMP_STATUS_LABELS` and `STATUS_STYLE` are `Record<CompStatus, …>`, so a new
  member *is* caught there by the compiler.
- The manual comp form does hard-code `status: "sold"` (`CompsPanel.tsx:1096`).
- `arv.ts:456`, `:493`, `:689` filter on `sold` and are correct unchanged — a
  pending listing is not a sale.

### Open

The testing question was decided by the owner before this review: deferred, with
the cost recorded in Testing above. Nothing here reopens it.

**Recommendation: revise items 1-4 and proceed.** None is deep — items 1 and 2
are both the same omission, a change traced one step but not two. The design is
sound as far as a self-review can say, and §1 is worth doing on its own merits
whatever happens to the rest.

**This review is not approval to start, and nothing in it authorizes running
the migration.**
