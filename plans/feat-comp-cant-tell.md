# Plan: when you cannot tell, say so

Status: **Revised (rev 2)** — 2026-10-21. Awaiting the owner. No code written.
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

Four changes, in one migration because they share a table and a lock, **in
this order inside the one transaction** — change 4 constrains a value that
change 3 must have admitted first, so swapping them fails the migration:

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

**§5 depends on this section and cannot ship without it.** `arv.ts:692-694`
counts the basis in three explicit branches — `sold`, `removed`, `active` — so
a `pending` comp inside `basis` is counted in none of them and the basis line
silently undercounts. `tsc` cannot see it.

That is unreachable **only because this section makes a pending comp
unapprovable**, and `basis` is built from approved comps alone. The two are one
change wearing two numbers. **If §1 is dropped, deferred or reverted, §5 must
be too** — or `arv.ts` needs a fourth count added in the same breath.

No fourth count is added here. The plan takes the narrower fix and writes the
reason down, because a count for a state that cannot occur is dead code that
reads as live.

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
- **Its date reads "Listed", deliberately.** `compDate`
  (`lib/comps/format.ts:167-171`) maps sold and removed to `removedDate` and
  everything else to `listedDate`, so a pending comp falls through to *"Listed
  Mar 2026"*. The useful date would be when it went under contract, and nothing
  records that — RentCast cannot report the status at all, and the manual form
  would be asking for a date the owner may not have. "Listed" is true and
  available. No branch is added for it; this line is the decision.

## Scope — every file

| File | Change |
|---|---|
| `supabase/migrations/<ts>_…sql` | **new**, written and NOT run |
| `lib/comps/types.ts` | `cant_tell_skip`, `pending`, labels, `compReviewOptions`, `Comp.reviewNotes` |
| `lib/comps/compService.ts` | `CompRow`, `toComp`, **`setCompReview` signature** |
| `app/api/properties/[id]/comps/[compId]/route.ts` | accept the value and the notes |
| `app/api/properties/[id]/comps/route.ts` | accept `pending` on a hand-entered comp |
| `lib/comps/arv.ts` | `unreadable` on `ArvResult`; `stillToReview` excludes unreviewable |
| `lib/screen/screenRow.ts` | **reads, probably unedited** — see below |
| `lib/supabase/database.types.ts` | **regenerated by the owner**, not edited |
| `components/crm/CompReviewCard.tsx` | notes field, the sixth option, Pending pill and sentence |
| `components/crm/CompsPanel.tsx` | basis line, notes on rows, manual form status choice |
| `components/crm/CompControls.tsx` | counts exclude unreviewable comps |
| `tests/unit/arv.test.ts` | the new counting and the new state |
| `tests/23-comps.spec.ts` | see Testing |

**`screenRow.ts:236` reads `stillToReview` directly** (`const compsToReview =
arvResult.stillToReview`) and the Screen table shows it. So §1 changes a
number on **every house's row on another page**, not only on the ARV tab.

That is the intended fix and it is still a behaviour change outside the tab
this plan is scoped to, which is why the file is listed. It likely needs no
edit — it passes the value through — but "likely" is not something to discover
after the fact, and the scope table is what is being agreed to.

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

**2026-10-21 — Changes requested.** Independent Approver review. I did not
write this plan and will not write the implementation. Every claim below was
checked against the code at `3d17389`.

The plan is good. §1 is the right call and the reasoning for it is the best
thing in the document. But §1's blast radius is wider than the scope table,
the silent-call-site count is low by at least four, and one claim in Risks is
factually wrong. Seven items.

## 1. §1 is correct, and has four consequences it does not name

The diagnosis holds exactly as described: `20261019010000:57` defaults `review`
to `needs_review` for every row whatever its status, and
`compReviewOptions` (`types.ts:62`) gates only on `status === "removed"`, so an
active listing is offered the full set of answers. Asking "was it fixed up like
yours will be?" about a house that has not sold is a question with no answer.
**Agreed, and it is the highest-value item here.** Four things follow that the
plan does not trace.

### 1a. BLOCKING — the arithmetic does not exclude what §1 says is excluded

§1 and §5 both assert active and pending comps are "not counted". Nothing in
the plan makes that true. `arv.ts:613` is:

```ts
const approved = comps.filter((c) => c.review === COMP_REVIEW_COUNTS);
```

No status filter. `arv.ts:695` computes `activeCount` from the basis and
`arv.ts:742` feeds it into `listingCount`, so the arithmetic explicitly
contemplates active comps being counted — that path is live today. The plan
changes `stillToReview` (:614) and leaves `approved` (:613) alone.

So "not counted" is a claim about what the UI will offer, not about what the
number does. Two gaps follow:

- **Any row already at `renovated_use` with an active status keeps counting**,
  invisibly, forever. The plan says all 81 comps are `needs_review`, which
  probably means none exist — but "probably" is doing load-bearing work in a
  plan about a number that must stop moving on its own.
- **Worse, such a row becomes unreachable.** `CompReviewCard.tsx:258` builds
  its options from `compReviewOptions(comp.status)`. Return `[]` for active and
  an already-approved active comp renders with no options at all: counted in
  the resale price, and no control on the screen can change it.

Fix both, and say so: add the status guard at `:613` as well as `:614`, and
run a read-only count of active-or-pending rows not at `needs_review` before
the UI change ships. If the count is zero, say it is zero and move on.

### 1b. BLOCKING — the default tab lands on an empty queue

`CompControls.tsx:191`:

```ts
return comps.some((c) => c.review === "needs_review") ? "todo" : "done";
```

For a house whose comps are all active, every row is `needs_review`, so this
returns `"todo"` and opens **Still to check**, which §1 has just emptied. The
owner taps in and sees nothing, on the exact houses §1 was written to fix.

`CompControls.tsx:70` (`todo: ["needs_review"]`) and `:108-109` need the same
exclusion. The scope table names `CompControls.tsx` for "counts exclude
unreviewable comps" — the tab default is a different function and wants naming.

### 1c. The scope table is missing `lib/screen/screenRow.ts`

`screenRow.ts:236` is `const compsToReview = arvResult.stillToReview;`, surfaced
as `compsToReview` on the screen row and read by **`PropertyDetailPage.tsx:505-509`**
and **`PropertiesPage.tsx:505-509`**: *"N comps still to review"* and *"No comps
approved yet, and N are waiting"*.

So §1 changes a number on two surfaces beyond the comps tab. The plan names
those two files only to say the *unreadable* count stays off them — which I
agree with — and does not notice that `compsToReview` on the same two cards
moves as a direct consequence. `lib/screen/screenRow.ts` belongs in Scope, and
the PR note in §1 ("changes a number the owner has already seen") should say
it changes on three surfaces, not one.

Good news, verified: nothing persists these counts. `screenService.ts` holds no
`stillToReview` or `compsToReview`, so they are computed live and there is no
stale-cache problem. Worth stating, since it is the obvious worry.

### 1d. Endorsing the choice the plan made implicitly

Keeping `review = 'needs_review'` on active rows and filtering in the read path
is the right call, and the plan should say it is a choice. The alternative — a
`not_applicable` review state — would be a far bigger migration, would fight
`property_comps_review_has_reviewer`, and would destroy information when a
listing later goes removed and becomes genuinely reviewable. Filtering on read
means that transition costs nothing. State it so the next reader does not
re-litigate it.

## 2. The migration: split it, and the CHECK guard needs a discriminator

### 2a. Four changes in one transaction — I would make it two migrations

Not for lock reasons; the plan is right that they share a table. For
**revertability and optionality.** Changes 1-2 (`cant_tell_skip`,
`review_notes`) solve problems 1 and 2, are low-risk, and touch no shared type.
Changes 3-4 (`pending`) add a `CompStatus` member, which is the widest blast
radius in this plan — see item 3, where the real silent-site count is seven.

Bundled, the owner has one decision: all of it or none. Split, the owner can
run the can't-tell migration, ship §2 and §4, and take Pending's blast radius
separately. §1 needs no migration at all for its active half, so the work
already divides three ways. One commented-out Down covering four changes also
cannot revert Pending without reverting notes.

Not a correctness objection. A sequencing one, and the owner's call.

### 2b. The "exactly one match" guard is right and under-specified

I inventoried every CHECK on `property_comps`. Constraints whose definition
mentions **`status`**:

1. the inline domain CHECK, `status IN ('active','removed','sold')`
   (`20261019010000:57`) — generated name, and the one that must change
2. `property_comps_sold_needs_proof` — `status <> 'sold' OR source IN (…)`
3. `property_comps_removed_sale_needs_price` — `NOT (status = 'removed' AND
   review = 'renovated_use') OR sale_price IS NOT NULL`

And mentioning **`review`**: `property_comps_review_check`,
`property_comps_review_has_reviewer`, and #3 again.

So a lookup on `%status%` matches three, and `%review%` matches three. "Looked
up by definition" is not yet a lookup. The discriminators that actually work:

- **Status:** `ILIKE '%active%'` matches only the domain CHECK — neither of the
  other two mentions `'active'`. Better still, match structurally: a
  single-column CHECK whose `conkey` is just `status`.
- **Review:** keep `20261020220000`'s two-predicate trick exactly —
  `ILIKE '%needs_review%' AND ILIKE '%renovated_use%'`. I verified it is
  still unique: `review_has_reviewer` lacks `renovated_use`,
  `removed_sale_needs_price` lacks `needs_review`. That precision was
  deliberate and is easy to lose in a rewrite.

Put the predicates in the plan. "Counts matches and raises unless exactly one"
is the right guard and will fire on a `%status%` lookup, correctly, and stop
the migration dead.

### 2c. One interaction, checked and clear

`property_comps_removed_sale_needs_price` only bites on `status = 'removed'`
with `review = 'renovated_use'`. Pending comps are never reviewable under §1,
so there is no interaction. Worth one line in the migration so nobody has to
re-derive it.

## 3. The silent call sites: three named, seven real — and one Risks claim is wrong

> "`COMP_STATUS_LABELS` and `STATUS_STYLE` are `Record<CompStatus, …>` so `tsc`
> finds those"

**Half wrong.** `COMP_STATUS_LABELS` is `Record<CompStatus, string>`
(`types.ts:190`) and is caught. But:

- **`STATUS_STYLE` is `Record<string, string>`** (`CompReviewCard.tsx:71`).
- **`STATUS_MEANING` is `Record<string, string>`** (`CompReviewCard.tsx:58`).

Neither is compiler-checked. And their call sites make the failure quiet rather
than loud: `CompReviewCard.tsx:160` and `CompsPanel.tsx:928` both read
`STATUS_STYLE[comp.status] ?? STATUS_STYLE.active`, so **a Pending comp renders
with the Active pill** — no blue, indistinguishable from active, which is the
whole thing §5 exists to fix. `STATUS_MEANING[comp.status]` at `:186` has no
fallback at all, so the status sentence renders `undefined`.

The fix is better than adding two entries: **tighten both to
`Record<CompStatus, string>`.** That converts two silent sites into
compiler-enforced ones for this change and every future one, and it is a
two-word diff. Then drop the `?? STATUS_STYLE.active` fallbacks, which exist
only because the type was loose.

Three more the plan does not name:

- **`PRICE_MEANING`** (`format.ts:48`) is `Partial<Record<CompStatus, string>>`,
  read at `:60` as `PRICE_MEANING[comp.status] ?? null`. `Partial` means a new
  member is legal and silent, so a Pending comp gets **no price label** — on a
  status whose entire point is that the price is not final. It needs an entry
  (and `Partial` deserves a second look, though it may be deliberate for
  statuses that genuinely have nothing to say).
- **`app/api/properties/[id]/comps/route.ts:19`** — the most dangerous one:

  ```ts
  value === "active" || value === "removed" ? value : "sold";
  ```

  Anything that is not active or removed **becomes `sold`**. Post `pending`
  today and you create a confirmed sale that enters the resale price.
  `types.ts` says collapsing a non-sale into `sold` is "the single easiest way
  to inflate an ARV", and this is that, by default, in a ternary. The plan
  names this file in Scope ("accept `pending`") but not in Risks, and it is the
  one site where missing the edit is actively harmful rather than merely
  broken. The migration's evidence CHECK is the backstop and is a good reason
  to keep change 4.
- **`compDate`** (`format.ts:167-172`) branches on sold and removed and falls
  through to `Listed <month year>`. For Pending that is defensible — it was
  listed, and we have no under-contract date — but it is unexamined
  fallthrough rather than a decision. One line either way.

**Verified correct and worth keeping:** `fromRentCast.ts:22` maps everything
not inactive to active, and `tests/unit/arv.test.ts:757` already pins
`mapCompStatus("Pending") === "active"`. The plan's reasoning — a sync can
never learn a listing went under contract, so the mapper must not invent it —
is right, and the existing test guards it.

`matchesFilter`'s `listings` case (`CompControls.tsx:119`, `status !== "sold"`)
is named by the plan and its self-criticism is accurate: it includes pending by
accident. Make it intentional.

## 4. `unreadable: number` is the right shape; the function signature is not

Keep the flat scalar. `ArvResult` already carries `soldCount`, `removedCount`,
`activeCount`, `skippedForMissingData` and `stillToReview` as flat counts;
introducing a breakdown object for the sixth would be inconsistent with the
five beside it and would churn the public type for no gain. **Accepted as
proposed.**

Two notes.

- `buildApprovedLabel(approved, stillToReview)` (`arv.ts:201`) becomes three
  positional numbers, and the next count makes it four. Take an object —
  `{ approved, unreadable, stillToReview }` — now, while it has one call site
  (`:790`).
- **Say why `unreadable` gets a sentence and `skippedForMissingData` does not.**
  A comp the owner approved that lacks a price or size is dropped at
  `arv.ts:655-660` and surfaces only as a warning when *everything* is
  dropped. That is also "you approved it and it is not in the number", which is
  the exact thing §3 argues deserves saying out loud. I am not asking for it in
  this branch — I am asking the plan to say it is a deliberate line, so the
  inconsistency is a decision rather than an oversight.

## 5. Testing — my reading, for the owner

The situation, verified: `.github/workflows/ci.yml:48-96` has the Playwright job
commented out as "TEMPORARILY DISABLED"; CI runs `npm run build` (`:30`) and
`npm run test:unit` (`:45`) only. 8 of 55 in `23-comps.spec.ts` fail on main,
five asserting ARV figures or basis text — which §3 rewrites.

**My reading: write the unit tests, record a baseline, write the Playwright
cases but do not gate on them.** Reasoning:

- **The core of this change does not need a browser.** §1, §2 and §3 are pure
  logic — option gating, counting, skip derivation, basis text. The plan's
  seven unit cases cover them well, and `npm run test:unit` actually runs, in
  CI, today. That is real protection, unlike Stage A where the risk was layout.
  Add two: the `:613` status guard from item 1a, and `unreadable` counting only
  `cant_tell_skip`.
- **Record the five ARV/basis failures' current text before touching §3.** This
  is the only thing that makes "new failure" distinguishable from "failure that
  was already there", it is read-only, and it costs one command. Without it the
  question is undecidable and the project rule about not claiming a pass cannot
  be honoured either way.
- **Write the Playwright cases for §4 and §5** — the notes field and the
  Pending pill are affordances only a browser sees — but mark them, in the
  plan and in the spec, as not yet gating, with the reason. A test written and
  honestly labelled as not-yet-running is not a skipped test; a test claimed as
  passing when the job is commented out would be.

On the rules themselves: §Testing's "no exceptions" cannot be satisfied in
spirit while the job is disabled and the relevant assertions are already red.
Writing cases nobody runs and calling the feature done is the "placeholder
presented as finished work" the rules forbid. Deferring and saying so is the
honest reading. **It is still the owner's call, and the plan is right to mark
it OWNER rather than decide it.**

## 6. Smaller items

- **`activeCount` goes structurally dead** once item 1a lands — always 0, with
  `listingCount = removedCount + activeCount` (`:742`) feeding the plain
  summary. I checked: `tests/unit/arv.test.ts:154` and `:254` both still pass.
  Say whether it stays as a harmless zero or the summary wording changes. Do
  not delete it as part of this work.
- **`compService.ts:456-457`** sets `review_set_by`/`review_set_at` from
  `review === "needs_review"`. Unaffected by §1 (active rows stay at the
  default), but it is the third place that branches on `needs_review` and is
  worth a glance during the edit.
- **`scripts/review-reset.ts`** resets every comp to `needs_review` and is
  already in the broken-by-`reviewNotes` list. Under §1 its printed "before and
  after" counts change meaning. Not a blocker; it is a script, and it is named.

## Assessment against the rules

- **Scope** — one omission (`lib/screen/screenRow.ts`, item 1c) and one
  understatement (the three surfaces, not one). Otherwise thorough: the
  `reviewNotes` breakage list is complete and correct.
- **Stack** — clean. TypeScript strict, Tailwind, no new dependencies, SQL as
  the named exception, Next/React versions stated, and the `AGENTS.md`
  instruction carried through.
- **Refactor-first** — good. `COMP_REVIEW_SKIPS` picking up the new value with
  no second edit is `e5eb59f` paying off exactly as intended, and the plan is
  right to say so. `compReviewOptions` as the single place that decides what
  may be answered is the correct seam for both §1 and §2. Nothing deleted.
- **Risks** — one claim factually wrong (item 3), and the count low by four.
  Everything else is named, including the `setCompReview` signature and the
  `COMP_REVIEW_ORDER` validator.
- **Sequencing** — the strongest section. Migration written, owner runs it,
  owner regenerates, then code. `database.types.ts` not hand-edited, for the
  right reason. The correction of the stale "WRITTEN, NOT RUN" banners with
  evidence is exactly right, and `5f50b8c` is the kind of commit that keeps a
  plan trustworthy.
- **Writing rules** — the three new sentences all say what the thing is, why it
  matters and what it does. *"Under contract. The price isn't final, so it
  isn't in your resale price yet."* is the standard the rest of the app should
  meet. No internal words. `Later` discarding notes is disclosed on the button,
  which is the honest choice.

## Open questions for the owner

1. **One migration or two?** (Item 2a.) My lean: split Pending out, so
   can't-tell and notes can ship without waiting on a new `CompStatus` member.
2. **Testing.** (Item 5.) My reading is above; §Testing cannot be honoured in
   spirit with the Playwright job commented out, so I would write the unit
   tests, baseline the five failures, and write-but-not-gate the browser cases.
3. **Are there any active or pending comps not at `needs_review`?** (Item 1a.)
   A read-only count, before the UI change ships. If it is zero this stops
   being a question.
4. **Does `skippedForMissingData` deserve the same sentence as `unreadable`?**
   (Item 4.) Not this branch — but say whether the asymmetry is deliberate.

## Recommendation

**Changes requested: items 1a, 1b, 1c and 3.** Those four are substantive —
one leaves a number counted that the plan says is not counted and a comp the UI
cannot reach, one lands the owner on an empty tab, one is a missing file and
two under-announced surfaces, and one is a Risks claim that is wrong in a way
that would ship a Pending pill styled as Active. Items 2b and 4's signature
note are a few lines of plan text. Items 2a and 5 are the owner's calls and I
have given my reading of both.

§1 deserves saying plainly: it is the best item in this plan. "An active
listing is not a chore, it is context" is the correct read of the design
system, and finding it while planning something else is the kind of thing a
plan is for. The reason it draws most of my objections is that it is the change
that actually moves numbers — which is also why it is worth getting right.

Revised on 1a, 1b, 1c and 3, I expect to approve this.

**The owner makes the final call. This review is not approval to start, and
nothing in it authorizes running the migration or regenerating the types.**
