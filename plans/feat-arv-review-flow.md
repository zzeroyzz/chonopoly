# Plan: review one house at a time

Status: **Revised (rev 2)** — 2026-10-21. Awaiting the Approver, then the
owner. No implementation code written.
Branch: `feat/arv-review-flow`, cut from `367ade7` (tip of main), two docs
commits plus one authorised bug fix on it.
RentCast requests: **0**. Nothing here fetches anything.
Design system: https://claude.ai/artifact/AfFqeoXw92zbqvYSFpchrx — `review-flow.md`.

**Revision 2 answers the self-review's items 1-4 and the independent
Approver's items 5-13.** Where an item needed a decision the owner has not
made, the decision is stated as an assumption and marked **OWNER**.

## Precondition — corrected

`fix/comp-controls` **is merged**: `367ade7`, "Merge pull request #57", is the
tip of `main`. `feat/arv-review-flow` **is already cut** from it. The branching
rule was followed; rev 1's "not yet cut" text was stale.

`took_off_market_skip` (self-review item 2) **is already fixed on this
branch**, commit `e5eb59f`, at the owner's explicit instruction. The skip set
is now derived from `COMP_REVIEW_ORDER` in `lib/comps/types.ts`
(`COMP_REVIEW_SKIPS`, `isSkipped`) rather than listed twice. **This removes two
of the four silent sites in item 10** — the remaining two are below.

**OWNER, unanswered and blocking item 8:** have
`20261020200000_comp_review.sql` or `20261020220000_comp_sale_price.sql` been
applied to the database? Both say WRITTEN, NOT RUN while the TypeScript reads
their columns.

## The problem

The ARV tab works and is painful to use. A scrolling stack of small cards, each
carrying the same question and two dropdowns stacked on top of each other. The
work happens in another app — out to Zillow, look at photos, come back.

Eleven times, on a phone, it breaks in five places:

1. **Eleven cards of equal weight.** Nothing says which one you are on.
2. **You lose your place.** Every card looks the same on return.
3. **The subject house scrolls away** — the facts you are comparing against.
4. **Two stacked dropdowns to reach four links.**
5. **Nowhere to write down what you saw.**

Underneath: when a removed listing's photos are gone, the five review states
force a guess between "it counts" and "leave it out". Both move the ARV on no
evidence.

## Goal

One house on screen at a time, with everything the decision needs on it, and a
sixth review state for "the photos are gone and I cannot tell".

## Stack

TypeScript strict, Tailwind utilities, tokens from `globals.css`. No new
dependencies. `lucide-react`, already present. SQL for the migration, the
named exception.

**Read `node_modules/next/dist/docs/` before writing any component code.**
This repo's Next is not the one in training data.

## Scope — every file that changes

Rev 1 named eight. The real count is nineteen. Each is listed because touching
a file not named in an approved plan is Tier 2.

**The flow**

| File | Change |
|---|---|
| `components/crm/CompsPanel.tsx` | one card, tabs, sticky specs; **export nothing** — see Refactors |
| `components/crm/CompReviewCard.tsx` | **new** — the one card |
| `lib/comps/format.ts` | **new** — the eight shared formatters, see item 5 |
| `components/crm/CompControls.tsx` | tabs added; two halves leave the filter |
| `components/crm/CompLinks.tsx` | dropdown becomes five pills |

**The data path**

| File | Change |
|---|---|
| `lib/comps/types.ts` | `cant_tell_skip`; `reviewNotes` on `Comp` |
| `lib/comps/compService.ts` | `CompRow`, `toComp`, **`setCompReview` signature** |
| `app/api/properties/[id]/comps/[compId]/route.ts` | accept the value and the notes |
| `lib/supabase/database.types.ts` | `review_notes` — **see Sequencing** |
| `lib/comps/arv.ts` | reporting only, not arithmetic — see Refactors |

**Styling**

| File | Change |
|---|---|
| `app/globals.css` | **`--color-reviewing` does not exist.** It is added here. |

**Files broken by adding `reviewNotes` to `Comp`** — `tsc` catches all six:
`scripts/review-reset.ts`, `scripts/diagnose-comps.ts`,
`tests/27-recorded-sales.spec.ts`, `tests/unit/screenRow.test.ts`,
`tests/unit/arv.test.ts`, `tests/23-comps.spec.ts`.

**Consumers of the basis line:** `components/crm/PropertyDetailPage.tsx` and
`components/properties/PropertiesPage.tsx` each compose their own "Built from
N comps you approved" sentence. **OWNER (item 7):** assumption — the ARV card
gains the unreadable count, these two **stay as they are**. Saying it in three
places triples the surface for one fact.

**Migration:** `supabase/migrations/<ts>_comp_cant_tell_and_review_notes.sql`,
**new, written and NOT run.**

## Approach

### 1. Migration — written, NOT run

A sixth review value and one column.

```
'needs_review' | 'renovated_use' | 'not_renovated_skip'
| 'took_off_market_skip' | 'not_comparable_skip' | 'cant_tell_skip'
```

`cant_tell_skip` skips arithmetically. It is kept apart because it records a
different judgement and is the only one the ARV basis line must mention aloud:
a resale price built from four houses where two more were unreadable is a
different number from four out of six.

`review_notes text`, because `notes` is taken — `CompLinks.tsx:71` reads
`comp.notes` as the listing URL on hand-entered comps
(`comp.notes?.startsWith("http")`). Writing review notes there breaks the link
on exactly the comps typed in by hand.

Structure follows `20261020220000`: baseline temp table, CHECK looked up by
definition not by name, re-add, verify block, commented Down. **With item 13's
guard:** `property_comps` now carries three review-related CHECKs, and `SELECT
… INTO` takes an arbitrary row when several match. Count the matches and
`RAISE EXCEPTION` unless it is exactly one.

**Not run. Not run during testing. The owner runs it.**

### 2. Sequencing — the problem `feat-comp-review.md` named and rev 1 dropped

`database.types.ts` is generated and cannot be regenerated until the migration
runs. Code reading `review_notes` does not typecheck until then — so the
plan's own stopping gate, `npm run build` and `tsc`, cannot pass.

The last plan's answer was "I stop and ask". **This plan's answer, stated so
it is not discovered at the gate:**

> The work splits at the migration. **Stage A** is everything that needs no new
> column. **Stage B** is everything that does, and Stage B does not begin until
> the owner says the migration has run.

| Stage | Contents | Gate |
|---|---|---|
| **A** | sticky specs, tabs, five pills, the one-card flow, `lib/comps/format.ts`, `--color-reviewing` | `tsc` + build pass today |
| **B** | `cant_tell_skip`, review notes, the basis-line count | needs the migration run first |

`database.types.ts` is **not** hand-edited ahead of the migration. A generated
file edited by hand is a lie that survives until the next regeneration.

### 3. The card — `CompReviewCard.tsx`

Address and "3 of 7" · price with the status pill · spec line · status
sentence · five source pills · the review choices as radio rows ·
**the sale-price step** · notes · Save and next / Later.

**Item 6 — the sale-price step is not optional.** `route.ts:87` rejects
`renovated_use` on a removed comp with no sale price, and the database CHECK
`property_comps_removed_sale_needs_price` enforces the same. Today
`CompsPanel.tsx:984-1001` routes that through **`SalePricePrompt`**. The card
**reuses that component, not a copy of it**, and it appears between the choice
rows and the notes field, shown only when the choice is "it counts" and the
status is `removed`. Without this, Save 400s on the exact case the feature
exists for.

- Save is disabled until a choice is picked, with the sentence saying so.
- `Later` returns the comp to Still to check; it is not a review state.
- Saving advances to the next unreviewed comp.
- Nothing is pre-selected, ever.

### 4. Keeping your place

From tapping a source until a choice is recorded: violet border and tint, the
tapped pill stays lit reading "Zillow — opened", and a line says it in words.
Colour is never the only signal.

**Item 7 — `--color-reviewing` does not exist in `app/globals.css`.** It is
added there in this change, beside `--color-accent`, as
`--color-reviewing: #A78BFA;` with `--color-reviewing-tint:
rgba(167,139,250,0.12)`. Violet is used for nothing else in the app, which is
the whole point.

### 5. Tabs

`Still to check (n)` · `Checked (n)`, below filter and sort. Opens on Still to
check unless empty. `needs_review`, `approved` and `skipped` leave the filter;
`all`, `sold`, `listings`, `flagged` stay.

**Self-review item 4:** `CompControls.tsx:143` `defaultFilter` returns
`"approved"`, which has no meaning once that option is gone. It is **deleted
and replaced by the tab's own default** — this is removal of a function made
genuinely dead by the change, not deletion as a method of fixing a bug.

### 6. Sticky specs

Address, price, beds, baths, sqft, year. `position: sticky`, `shadow-lg` once
content scrolls under. Two lines at 390px, under 72px.

### 7. Source pills — five, not four

**Item 9.** `searchUrls` currently returns `{ zillow, redfin, maps }` and is
imported by `PropertyDetailPage.tsx:28,414` (which reads `.zillow` only).

- **Google Maps stays.** Rev 1 silently dropped a working link. Five pills:
  Zillow · Redfin · Realtor · Records · Map.
- **The return shape gains `realtor` and `records`.** Additive, so
  `PropertyDetailPage` is unaffected — but it is an exported-interface change
  and is named in Risks.
- **Records — what it actually opens.** There is no county-records URL builder
  anywhere, and `Comp.county` is null on every RentCast comp. So the honest
  mechanism is **a web search for `"<address>" county property records`**, not
  a deep link. Rev 1's claim that "the county record works when every photo is
  gone" overstated it. The pill's help text says what it is: *"Searches for the
  county record. Works when the photos are gone."*
  **OWNER (item 9):** if there is a county site you use by hand, name it and
  this becomes a real link instead of a search.

### 8. The sixth state's label

**Item 13.** `COMP_REVIEW_LABELS` needs a string, and the writing rules say a
verdict must say why and what it does:

> `cant_tell_skip: "Photos are gone — can't tell. Left out of the resale price."`

### 9. Reporting the unreadable count

**Self-review item 3.** Rev 1 said `arv.ts` is "not touched" while requiring
the basis line to report unreadable comps. Both cannot be true.

The **arithmetic** is unchanged — `arv.ts:613-614` reads `review` only as two
equality checks. The **reporting** is not: `ArvResult` gains
`unreadable: number`, populated beside `stillToReview` at `arv.ts:613-630`.
`ArvResult` is a public type; `tests/unit/arv.test.ts` is in scope above.
Stage B.

## Refactors — what is shared, not duplicated

**Item 5 — the eight private formatters.** `dollarsShort`, `shortDate`,
`perSqft`, `priceLabel`, `provenanceLabel`, `fixerUpperNote`, `monthYear`,
`compDate` are module-private in `CompsPanel.tsx:31-193`. The new card needs
most of them.

**Decision: they move to `lib/comps/format.ts`, and both components import
them.** Not exported from `CompsPanel.tsx`, for a concrete reason rather than
taste: `CompsPanel` imports `CompReviewCard`, so `CompReviewCard` importing
helpers back out of `CompsPanel` is a circular import. They are pure functions
with no React in them and no business in a 1,225-line component. This is a
third new file and it is named in Scope.

- **`CompRow` stays.** It is the right control for the Checked tab, where the
  owner scans rather than decides. Nothing is deleted to make room.
- **`SalePricePrompt` is reused**, not copied. See §3.
- `searchUrls`, `compReviewOptions`, `matchesFilter`, `sortComps`,
  `filterCounts`, `isSkipped` extended in place.
- `cant_tell_skip` joins `took_off_market_skip` under `compReviewOptions`'
  removed-only rule: an active listing's photos being gone is not a thing.

## Risks — every Tier 2 action, named

- **A migration is written.** Not run. Needs its own instruction.
- **Three new files**: `CompReviewCard.tsx`, `lib/comps/format.ts`, the
  migration. Each justified above.
- **`setCompReview`'s signature changes** (`compService.ts:440`) to carry the
  notes. This repo's hard rule: *never change function signatures without
  checking all call sites.* It currently takes
  `(compId, review, ctx, userId, sale)`; notes join `sale` as an options
  object rather than a sixth positional. Call sites checked before the edit.
- **`searchUrls`' return shape changes** — exported, additive.
- **`app/globals.css` is edited** to add the token.
- **`ArvResult` gains a field** — public type.
- **Two silent non-exhaustive sites remain** after `e5eb59f`, and `tsc` will
  **not** find them (item 10):
  - `COMP_REVIEW_ORDER` (`types.ts:74`) — the API validator. Miss it and
    `route.ts:70` returns 400 for the new value, with a clean build.
  - `compReviewOptions` (`types.ts:61`) — miss it and the choice never renders.

  `tsc` **does** catch `COMP_REVIEW_LABELS` and `REVIEW_TONE`, both
  `Record<CompReview, …>`. Rev 1's claim that the compiler finds everything was
  wrong; this is where reading is required.
- No change to auth, RLS, env, CI, lockfiles, or any Plaid path.

## Testing

### Existing tests that change, and why — stated before the work

**Item 11.** `tests/23-comps.spec.ts:432-477` — "skipping a comp moves the
ARV" and "approving a comp again restores the ARV" — drive
`comp-review-comp-4-option-*` on the default Needs-review view, which is the
view the new card replaces. **They must be rewritten, and the reason is that
the UI deliberately changed, not that they went red.** Recorded here so the
two are distinguishable afterwards. **The assertions are kept**: a review
moves the ARV, a skip does not.

### New cases

1. one card at a time; saving advances to the next
2. "3 of 7" counts down
3. Save disabled with no choice, and says why
4. tapping a source lights that pill and marks the card
5. `Later` returns the comp to Still to check, records no review
6. tab counts move when a review is saved
7. **approving a removed listing asks what it sold for, and does not 400**
8. "Can't tell" skips the comp and the basis line says how many were
   unreadable *(Stage B)*
9. the spec bar stays put while the list scrolls
10. review notes round-trip *(Stage B — see below)*

**Item 11, case 9:** no new 390px test. The file already sets
`viewport: 390x844` at `test.use` and already has "the Comps tab fits 390px
without sideways scroll". That one covers it.

**Item 8, case 10:** with the column absent this can only stub the route,
which proves the field round-trips through the UI and **nothing about
persistence**. It is named that way — "review notes reach the request" — and
the persistence test waits for Stage B.

### Gate

`npx playwright test tests/23-comps.spec.ts`, then `npm run build` and `tsc`.

**Known today, unrelated to this work:** 8 of the 55 tests in that spec
already fail on `main` — ARV values and refresh/lock flows. Verified by
running the spec against the pre-fix tree. They are **not** to be "fixed" as
part of this branch, and a pass here means those 8 and no others.

**OWNER (item 1), unanswered:** `CLAUDE.md` §Testing demands a passing
Playwright test, "no exceptions". §Stop At The Commit says "No tests. Run
`npm run build` and `tsc`", under a heading claiming it overrides everything
*below* it — and §Testing sits *above*, so the override does not reach it.
Both are in force. **Assumption used here:** write and run the Playwright
test, let build + `tsc` be the stopping gate. Say if that is wrong.

## Out of scope

- **Pending as a comp status.** Verified: `lib/rentcast/types.ts:130-135`
  documents Active/Inactive only, `fromRentCast.ts:22` maps inactive→removed.
  The app can never learn a listing went under contract, so Pending could only
  be hand-set — a change to manual comp entry, not to the review flow.
- Verdict levers on "Doesn't work" — the Deal tab.
- Team sharing — needs RLS work.
- Every other tab.
- Swipe gestures. Buttons first.
- `cashReservesTightMonths` 3 → 6.
- **Splitting the comps specs.** `23-comps.spec.ts` is 1,159 lines and 55
  tests; ten more is fine and the split is its own plan.
- **The 8 pre-existing Playwright failures.**

## Approver

**2026-10-21 — Changes requested.**

Reviewed at the owner's explicit instruction, twice given, after the implementer
objected. **This is a self-review and its limits must be stated:** the
implementer wrote this plan and cannot judge whether the design is the right
one. What follows is a verification of the plan's factual claims against the
code, which is the part a self-review can still do honestly. An independent
review by a separate instance was commissioned and is outstanding.

### 1. BLOCKING — "`tsc` will find them" is false

The Risks section claims every `switch` over `CompReview` will be caught by the
compiler. There are no switches. There are two hardcoded membership lists:

- `components/crm/CompControls.tsx:57`
  `const SKIPPED: CompReview[] = ["not_renovated_skip", "not_comparable_skip"];`
- `components/crm/CompsPanel.tsx:856`
  `comp.review === "not_renovated_skip" || comp.review === "not_comparable_skip"`

Both are type-correct with any number of union members missing. Adding
`cant_tell_skip` compiles clean and behaves wrong, silently. The plan's safety
argument for the type change does not hold and must be rewritten: these two
sites are found by reading, not by building.

### 2. BLOCKING — a pre-existing bug, found while checking item 1

`took_off_market_skip` shipped in `20261020220000_comp_sale_price.sql` and is
in `COMP_REVIEW_ORDER`, but it is absent from **both** lists above. Today, on
`main`:

- `matchesFilter(..., "skipped")` does not match it, and it is not
  `needs_review` or `renovated_use` either — so a comp marked "Took off
  market" appears under **no** filter except "All". It is invisible.
- `CompsPanel:856` does not treat it as decided, so hints keep firing on a
  settled comp.

This is not introduced by this plan; it is on the branch this plan builds
from. It must be fixed here or filed as its own fix before this work lands,
and the plan must say which.

### 3. BLOCKING — the plan contradicts itself about `arv.ts`

Refactors says *"The ARV arithmetic in `lib/comps/arv.ts` is **not touched**."*

Testing requires case 7: *"'Can't tell' skips the comp **and** the ARV basis
line says how many were unreadable."*

`arv.ts:613-630` is where `stillToReview`, `reviewPrompt` and the basis text
are built. Reporting a count of unreadable comps means adding a field to
`ArvResult` and populating it there. Both statements cannot be true. The
arithmetic is genuinely unchanged; the *reporting* is not, and `ArvResult` is
a public type with its own call sites.

### 4. Loose end — `defaultFilter`

`CompControls.tsx:143` returns `"approved"` once nothing needs review. With
those two options leaving the filter for the tabs, this function is either
dead or needs to point at the tab instead. The plan does not say which.

### Verified as claimed

- `CompLinks.tsx:71` does read `comp.notes` as a listing URL on hand-entered
  comps. The `review_notes` column is justified; there is no existing column
  that serves.
- `CompsPanel.tsx` is 1,225 lines. The new-file argument holds.
- `arv.ts` reads `review` only at lines 613-614, both equality checks. A sixth
  skip value needs no arithmetic change — see item 3 for the caveat.
- `compService.ts:450` is additive-safe.

### Open questions for the owner

1. Which rule wins on testing — §Testing's "no exceptions" Playwright
   requirement, or §Stop At The Commit's "No tests"?
2. Fix item 2's pre-existing bug on this branch, or file it separately?
3. Both prior comps migrations say WRITTEN, NOT RUN while the TypeScript
   already reads their columns. Has either been applied?

**Recommendation:** revise items 1-4 and resend. The design is sound as far as
a self-review can tell; the plan's accuracy about its own risk is not, and
item 2 is a live bug worth knowing about regardless of what happens to this
plan.

**The owner makes the final call. This review is not approval to start.**

---

## Independent Approver review — 2026-10-21

**Verdict: Changes requested.**

I am a separate instance from the one that wrote this plan and from the one
that wrote the self-review above. I did not write and will not write the
implementation. I verified every claim below against the code rather than
against the plan's description of it.

The self-review's items 1, 2 and 3 are **confirmed independently** — I found
the same three faults before reading it. Its item 4 is also real
(`CompControls.tsx:143` `defaultFilter` returns `"approved"`, which has no
meaning once `approved` leaves the filter). Those four stand as requested
changes and I do not restate them. Everything below is additional.

Note on process: the self-review in the section above is, as it says, not an
Approver review — the rules forbid acting as Approver for work you implement.
It was useful groundwork. This review is the one the workflow requires.

### Confirmed as the plan claims

- `CompLinks.tsx:71` really does read `comp.notes` as a listing URL
  (`comp.source === "manual" && comp.notes?.startsWith("http")`). There is no
  spare column that serves. **`review_notes` is justified.**
- `CompsPanel.tsx` is 1,225 lines. (It holds four React components —
  `CompsPanel`, `CompRow`, `SalePricePrompt`, `ManualCompForm` — plus eight
  private helpers, not "six components". The count is wrong; the argument
  survives it.)
- `lib/comps/arv.ts` touches `review` only at lines 613-614, both equality
  checks against `COMP_REVIEW_COUNTS` and `"needs_review"`. **A sixth skip
  value genuinely needs no arithmetic change** — the caveat is self-review
  item 3, which is about reporting, not arithmetic.
- **Keeping `CompRow` is correct** and is not a rules problem. The hard rule
  bites on deletion as a method of fixing a bug; this is retention. It is
  also the better design: the Checked tab is for scanning, not deciding.
  Conditional on item 5 below.
- **RentCast cannot report pending.** `lib/rentcast/types.ts:130-135`
  documents `status` as "Active" or "Inactive"; `fromRentCast.ts:22` maps
  `inactive → removed`, everything else → `active`; the fixtures carry only
  Active and Inactive. Pushing Pending out of scope is **correct and well
  reasoned.**
- The migration follows the house structure of `20261020220000`: baseline temp
  table, CHECK looked up by definition not by name, re-add, verify block,
  commented-out Down. **Correctly marked written-not-run.**

### 5. BLOCKING — the new file duplicates eight private helpers

This is the condition on which the new-file justification actually rests, and
the plan does not mention it. `dollarsShort`, `shortDate`, `perSqft`,
`priceLabel`, `provenanceLabel`, `fixerUpperNote`, `monthYear` and `compDate`
are all module-private inside `CompsPanel.tsx` (lines 31-193). The review card
needs most of them to render "price with the status pill · the spec line · the
status sentence". The Refactors section lists what it reuses — `searchUrls`,
`compReviewOptions`, `matchesFilter`, `sortComps`, `filterCounts` — and these
eight are not in it.

Two outcomes, and the plan must pick one in writing: export them from
`CompsPanel.tsx` (a module-surface change, Tier 2, and it must be named), or
copy them (which breaks "No duplicated logic. Shared behavior lives in one
place."). A third file for shared comp formatting is a third option and a
third new file. **Unanswered, the new-file justification does not hold** —
splitting a component out while cloning its helpers is not a split.

### 6. BLOCKING — approving a removed listing from the new card will fail

`CompsPanel.tsx:984-1001` routes `renovated_use` on a `removed` comp through
`SalePricePrompt` first, because `app/api/.../[compId]/route.ts:87` rejects
it with a 400 otherwise: *"Tell us what it sold for."* The database CHECK
`property_comps_removed_sale_needs_price` enforces the same thing.

The card described in §2 goes radio rows → notes → Save and next. There is no
sale-price step. On a removed listing — which is most of them, and the exact
case this feature is built for — Save returns a 400. `SalePricePrompt` appears
nowhere in the plan. State that the card reuses it (not a second copy) and
where it sits in the order.

### 7. BLOCKING — the scope table is missing files the change cannot avoid

Each of these is Tier 2 ("touching files not named in the approved plan") and
none is named:

- **`lib/comps/compService.ts`** — `review_notes` must enter the `CompRow`
  interface (line 35) and `toComp` (line 122), and `setCompReview` (line 440)
  must persist it. Its signature gains a field. That is an exported-function
  signature change (Tier 2) and this repo's own hard rule: *never change
  function signatures without checking all call sites.* The self-review's
  "`compService.ts:450` is additive-safe" is true about `keepsSale` and does
  not address that the file must change at all.
- **`lib/supabase/database.types.ts`** — `property_comps` has no
  `review_notes`. See item 8.
- **`app/globals.css`** — `--color-reviewing` **does not exist.** The tokens
  are `--color-accent` (#00D4AA), `--color-accent-glow`, `--color-warning`.
  §3 spends a paragraph on violet that nothing defines. Either add the token
  and name the file, or use one that exists.
- **Every file that builds a whole `Comp` literal**, because adding
  `reviewNotes` to the interface breaks them all:
  `scripts/review-reset.ts:80`, `scripts/diagnose-comps.ts:408`,
  `tests/27-recorded-sales.spec.ts:112,140`, `tests/unit/screenRow.test.ts:60`,
  `tests/unit/arv.test.ts:42`, `tests/23-comps.spec.ts:58,214`. `tsc` does
  catch these — they are cheap, but they are six unnamed files.
- **`components/crm/PropertyDetailPage.tsx`** — see item 9.
- **`tests/unit/arv.test.ts`** if item 3's `ArvResult` field lands;
  **`PropertyDetailPage.tsx:506-509`** and
  **`components/properties/PropertiesPage.tsx:506-509`** each compose their own
  "Built from N comps you approved · N still to review" sentence. If the basis
  line learns to say how many were unreadable, say whether those two cards say
  it too or deliberately stay quiet.

### 8. BLOCKING — the sequencing problem the last plan named, and this one drops

`feat-comp-review.md` said it plainly: *"`database.types.ts` cannot be
regenerated until the migration runs, so the service and UI work does not
typecheck until then — the same sequencing problem as last time, and the same
answer: I stop and ask."* This plan has the identical problem via
`review_notes` and does not carry that paragraph forward. The Precondition
notes the two prior migrations are unrun, then moves on.

The consequence needs stating, because it governs the stopping gate: with the
migration unrun, `npm run build` and `tsc` — the plan's own definition of done
— cannot pass over code that reads `review_notes` unless `database.types.ts`
is hand-edited ahead of the migration. Say which it is: hand-edit the
generated file and flag it, or stop and wait for the owner to run the
migration. Do not discover this at the gate.

Related: **testing case 10, "review notes survive a reload", cannot be
honest with the column absent.** Either it stubs the route — in which case it
proves the field round-trips through the UI and nothing about persistence, and
should be named that way — or it waits on the migration. Pick one in the plan.

### 9. `searchUrls` loses Google Maps and gains a pill with no address behind it

`searchUrls` returns `{ zillow, redfin, maps }` and is exported;
`PropertyDetailPage.tsx:28,414` imports it (it reads `.zillow` only, so this
will not fail `tsc`). §6's four pills are Zillow · Redfin · Realtor · Records.
So:

- **Maps disappears** from the comp card. That is removing a working link, and
  the plan never says it means to. Say so, or keep it.
- **The return shape changes**, which is a Tier 2 exported-interface change,
  and the Risks section does not name it.
- **"Records" has nothing to build a URL from.** There is no county-records
  URL builder anywhere in `lib/` or `components/` — I looked. County record
  sites differ per county, and `Comp.county` is documented in `types.ts` as
  populated only on a `public_record` comp, so it is `null` on every RentCast
  comp. §6 presents the county record as the answer to the missing-photos
  problem — *"the county record works when every photo is gone"* — with no
  mechanism. State exactly what that pill opens, and what it does when the
  county is unknown. If the answer is a web search for the county assessor,
  say that; it is a weaker claim and an honest one.

### 10. Item 1's list is longer than two, and the compiler's help splits cleanly

Worth recording precisely, because the plan should say where reading is
required and where building suffices.

`tsc` **does** catch: `COMP_REVIEW_LABELS` (`types.ts:46`) and `REVIEW_TONE`
(`CompsPanel.tsx:106`) — both `Record<CompReview, …>`.

`tsc` **does not** catch, in addition to the self-review's two:

- `COMP_REVIEW_ORDER` (`types.ts:74`), the API's validator. Miss it and
  `route.ts:70` returns 400 *"review must be one of: …"* for the new value,
  with a clean build.
- `compReviewOptions` (`types.ts:61`), which decides whether the option is
  offered at all. Miss it and the choice never renders.

Four silent sites, not two.

### 11. Existing tests will break by design — say so now

`tests/23-comps.spec.ts:432-477` ("skipping a comp moves the ARV", "approving
a comp again restores the ARV") drive `comp-review-comp-4-option-*` on the
default Needs-review view, which is exactly the view the new card replaces.
The plan says the spec is "extended, not replaced" and lists ten additions
without saying these must change.

They must, and the record needs to show why before the work starts, because
*"delete, weaken, or rewrite a failing test to make it pass"* is a Tier 3
never. A test updated because the UI deliberately changed is legitimate; one
updated at the gate because it went red is not distinguishable after the fact.
Name them, and keep the assertions (a review moves the ARV, a skip does not).

On sufficiency: the ten cases cover the flow well, and case 9 should simply
lean on what is there — the file already sets `viewport: 390x844` at
`test.use` and already has "the Comps tab fits 390px without sideways
scroll". Do not add a second one. The spec is 1,159 lines and 55 tests;
adding ten is fine, but it is near the point where the comps specs want
splitting, which is its own plan, not this one.

### 12. The Precondition is out of date

`fix/comp-controls` **is merged** — `367ade7`, "Merge pull request #57", is
the tip of `main`. And `feat/arv-review-flow` **is already cut**, from
`367ade7`, with two docs commits on it. The branching rule was followed
correctly. The plan still reads "not yet cut" and "assumes `fix/comp-controls`
is merged first". Correct the text so the record matches what happened.

### 13. Smaller things

- **The sixth state has no on-screen label in the plan.** `COMP_REVIEW_LABELS`
  needs one, and the writing rules require a verdict to say why and what to
  do. "Can't tell" alone does not. Something closer to: *"Photos are gone —
  can't tell. Left out of the resale price."* Put the string in the plan.
- **The migration filename under-describes it.** `<ts>_comp_cant_tell.sql`
  also adds a column. `_comp_cant_tell_and_review_notes.sql` or similar.
- **Guard the CHECK lookup against matching more than one constraint.**
  `property_comps` now carries three review-related CHECKs
  (`property_comps_review_check`, `property_comps_review_has_reviewer`,
  `property_comps_removed_sale_needs_price`). The two-predicate `SELECT conname
  INTO` in `20261020220000` happens to match exactly one today, but `SELECT …
  INTO` takes an arbitrary row when several match. Count them and raise if it
  is not exactly one.
- **Set the status line.** It still reads `Draft`; per the planning standard it
  should be `Changes requested`. I am limited to this section.

### Assessment against the rules

- **Scope** — leaks, materially. Items 7 and 9. The *design* is confined to
  the ARV tab; the *change* reaches `compService`, the generated DB types,
  `globals.css`, two scripts, four test files and `PropertyDetailPage`.
- **Stack** — clean. TypeScript strict, Tailwind utilities, no new
  dependencies, no CSS files, no inline styles, `lucide-react` already
  present. SQL for the migration is a named and legitimate exception. The
  instruction to read `node_modules/next/dist/docs/` before writing component
  code is correctly carried over from `AGENTS.md`.
- **Refactor-first** — fails on item 5 and item 6, and these are the same
  fault twice: the plan plans a new component without planning what it shares
  with the one it sits beside.
- **Risks** — three Tier 2 items are unnamed: the `setCompReview` signature,
  the `searchUrls` return shape, and `globals.css`. Named correctly: the
  migration, the two new files, the additive union member, the API shape, and
  that nothing touches auth, RLS, env, CI, lockfiles or Plaid. That last
  disclaimer I verified and it is true.
- **Testing** — adequate in shape, not yet honest about items 8, 10 and 11.
- **Migration** — correct in structure and correctly marked written-not-run,
  with item 13's guard.

### The testing contradiction is real

I checked both files. `chonopoly/CLAUDE.md` §Testing: *"Every major feature
must have a Playwright test written alongside it … The Playwright test must be
passing before the feature is marked done … no exceptions."* §Stop At The
Commit, under a heading that says it **overrides everything below**: *"No
tests. Run `npm run build` and `tsc` before stopping."*

Read literally, Stop At The Commit overrides what is *below* it, and §Testing
sits *above* it in the file — so the override clause does not reach it, and
both are in force, which is incoherent. This genuinely needs the owner. My
own reading, offered only as a reading: write the Playwright test, run it, and
let `npm run build` plus `tsc` be the stopping gate — "no tests" most likely
means "do not sit running the full suite", not "ship a major feature
untested", and §Testing is the more specific rule. But the owner says.

### Open questions for the owner

Carrying the self-review's three forward, since they are still unanswered:

1. **Which rule wins on testing** — §Testing's Playwright requirement, or
   §Stop At The Commit's "No tests"? (See above.)
2. **Have either of `20261020200000_comp_review.sql` or
   `20261020220000_comp_sale_price.sql` been applied?** Everything downstream
   turns on this, including whether this branch can typecheck. Only you know.
3. **The `took_off_market_skip` bug (self-review item 2) — fix here or file
   separately?** It is live on `main` today: a comp marked "Took off market"
   shows under no filter but All, and hints keep firing on it. I lean
   separately — it is a `fix/` branch of about four lines, it wants its own
   commit, and folding it in makes this PR two things. But it is cheap enough
   here that you may prefer it done once.
4. **The "Records" pill — what does it actually open?** (Item 9.) If there is
   a county site you use by hand, name it and the plan can build it.
5. **Should Google Maps survive as a fifth pill, or go?** (Item 9.)
6. **If the basis line gains an unreadable count, do the property card and
   the properties list say it too?** (Item 7, last bullet.)

### Recommendation

**Changes requested — items 5 through 13, plus the self-review's 1 through 4.**

The design is the right one. One house on screen, the subject facts pinned
above it, four ways out to go and look, and a sixth state for "the photos are
gone and I cannot tell" is a real answer to a real problem, and the reasoning
for keeping that state separate from the other skips is sound. Pending is
correctly deferred for a correct reason. The migration is correctly written
and correctly not run.

What the plan is not yet is accurate about its own reach. Its scope table
names eight files and the change needs at least fifteen. Two of its blocking
faults — the shared helpers and the sale-price step — are the same oversight:
a new component planned without planning its relationship to the component it
sits next to. And the sequencing problem that the last comps plan named out
loud is missing from this one, which matters because it decides whether the
work can reach its own stopping gate.

None of that is deep. It is a revision, not a redesign. Revised and resent, I
expect to approve it.

**The owner makes the final call. This review is not approval to start, and
nothing in it authorizes running the migration.**
