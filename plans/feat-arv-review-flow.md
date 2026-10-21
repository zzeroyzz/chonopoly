# Plan: review one house at a time

Status: **Draft** — waiting for the Approver, then the owner. No code written.
Branch: `feat/arv-review-flow` — **not yet cut.** See Precondition.
RentCast requests: **0**. Nothing here fetches anything.
Design system: https://claude.ai/artifact/AfFqeoXw92zbqvYSFpchrx — `review-flow.md`.

## Precondition, before a branch exists

`fix/comp-controls` has five commits and no merge. The rules say the next
branch starts from main only after the last one lands. This plan assumes
`fix/comp-controls` is merged first and `feat/arv-review-flow` is cut from the
updated main. **If it is not merged, stop — do not branch off it.**

Also true, and worth saying out loud before anything is built on top: the two
migrations this feature depends on, `20261020200000_comp_review.sql` and
`20261020220000_comp_sale_price.sql`, both say WRITTEN, NOT RUN. The
TypeScript already reads `review`, `sale_price` and `took_off_market_skip`.
Whether those columns exist in the database is something only the owner knows.

## The problem

The ARV tab works and is painful to use. It is a scrolling stack of small
cards, each carrying the same question and two dropdowns stacked on top of
each other. The actual work happens in another app — you tap out to Zillow,
look at photos, decide, come back.

Doing that eleven times, on a phone, breaks in five specific places:

1. **Eleven cards of equal weight.** Nothing says which one you are on.
2. **You lose your place.** Every card looks the same on return, so the only
   way to find the one you just looked at is to go back to Zillow and read the
   address again.
3. **The subject house scrolls away.** Two cards down, the price, beds, baths,
   size and year of the house you are buying are gone — the facts you are
   comparing against.
4. **Two stacked dropdowns to reach four links.**
5. **Nowhere to write down what you saw.**

And one correctness gap underneath all of it: when a listing's photos are gone
— which happens constantly on removed listings — the five review states force
a guess between "it counts" and "leave it out". Both move the ARV on no
evidence.

## Goal

One house on screen at a time, with everything the decision needs on it, and a
sixth review state for "the photos are gone and I cannot tell".

## Stack

TypeScript strict, Tailwind utilities, tokens from `globals.css`. No new
dependencies. `lucide-react` icons, already present.

Next.js: **read `node_modules/next/dist/docs/` before writing any component
code.** This repo's Next is not the one in anybody's training data.

## Scope — files that change

| File | Change |
|---|---|
| `components/crm/CompsPanel.tsx` | the flow: one card, tabs, sticky specs |
| `components/crm/CompControls.tsx` | tabs added; the two halves leave the filter |
| `components/crm/CompLinks.tsx` | dropdown becomes four buttons |
| `lib/comps/types.ts` | `cant_tell_skip` added to `CompReview` |
| `app/api/properties/[id]/comps/[compId]/route.ts` | accept the new value and review notes |
| `tests/23-comps.spec.ts` | extended, not replaced |
| `supabase/migrations/<ts>_comp_cant_tell.sql` | **new file, written not run** |
| `components/crm/CompReviewCard.tsx` | **new file** — see Refactors |

## Approach

### 1. The review states — migration, written and NOT run

A sixth value. Same shape as `20261020220000`: look the CHECK up by
definition rather than by name, drop it, re-add it with the new member,
verify, commit.

```
'needs_review' | 'renovated_use' | 'not_renovated_skip'
| 'took_off_market_skip' | 'not_comparable_skip' | 'cant_tell_skip'
```

`cant_tell_skip` skips arithmetically, like the other three. It is kept apart
for the same reason they are: it records a different judgement, and it is the
only one the ARV basis line has to mention out loud. A resale price built from
four houses where two more were unreadable is a different number from one
built from four out of six, and the owner should see that without going
looking.

Plus one column, `review_notes text`, because `notes` is already taken —
`CompLinks` reads `comp.notes` as the listing URL on a hand-entered comp
(`comp.notes?.startsWith("http")`). Writing review notes into the same column
would break the link on exactly the comps the owner typed in by hand.

The migration carries the same baseline / verify / commented-Down structure as
the two before it. **It is not run. It is not run as part of testing. The
owner runs it when the owner says so.**

### 2. The card — `CompReviewCard.tsx`

A new file, and under the rules that needs a reason: `CompsPanel.tsx` is 1,225
lines and already holds six components. The review card is the largest single
piece of this change, and adding ~250 lines to that file makes it unreviewable
in one sitting. The existing `CompRow` **stays where it is and is not
deleted** — see below.

The card holds, in order: address and "3 of 7" · price with the status pill ·
the spec line · the status sentence · the four source buttons · the five or
six review choices as radio rows · the notes field · Save and next / Later.

- Save is disabled until a choice is picked, with the sentence saying so.
- `Later` returns the comp to Still to check. It is not a review state.
- Saving advances to the next unreviewed comp; on the last, it lands on
  Checked.
- Nothing is pre-selected, ever.

### 3. Keeping your place

From the moment a source link is tapped until a choice is recorded, the card
takes `--color-reviewing` violet on its border and a tinted ground, the tapped
pill stays lit and reads "Zillow — opened", and a line says it in words:
*"You're on 1842 Maple Ridge Dr — the one you just opened in Zillow."*

Colour is never the only signal. The state is component-local; it does not
need to survive a reload, but it must survive the app being backgrounded,
which it does for free.

### 4. Tabs

`Still to check (n)` and `Checked (n)`, below the filter and sort. Opens on
Still to check unless it is empty. `needs_review`, `approved` and `skipped`
come out of the seven-option filter; `all`, `sold`, `listings` and `flagged`
stay in it.

### 5. Sticky specs

The subject house pinned above the list: address, price, beds, baths, sqft,
year. `position: sticky`, picks up `shadow-lg` once content scrolls under it.
Two lines at 390px, under 72px tall.

### 6. Source buttons

`CompLinks` keeps its `searchUrls` export — the property page imports it, and
a second copy would drift the moment one of those sites changes its URL shape.
The dropdown is replaced by four pills: Zillow · Redfin · Realtor · Records.

Realtor and Records are new and are the answer to the missing-photos problem:
Realtor keeps listing photos longest, and the county record works when every
photo is gone.

## Refactors — what is reused, not duplicated

- **`CompRow` stays.** It is the right control for the Checked tab, where the
  owner is scanning what the number is built from rather than deciding. The
  new card serves Still to check. Nothing is deleted to make room.
- `searchUrls`, `compReviewOptions`, `matchesFilter`, `sortComps`,
  `filterCounts` are all extended in place. `compReviewOptions` already gates
  `took_off_market_skip` to removed listings; `cant_tell_skip` joins it under
  the same rule, since an active listing's photos being gone is not a thing.
- The ARV arithmetic in `lib/comps/arv.ts` is **not touched**. One new skip
  state skips; the number's construction does not change.

## Risks — the Tier 2 items, named

- **A migration is written.** Not run. Needs its own instruction.
- **Two new files** (`CompReviewCard.tsx`, the migration), justified above.
- **`CompReview` is a public type** with call sites in the panel, the API
  route, the ARV builder and the tests. Adding a union member is additive, but
  every `switch` over it must be checked — `tsc` will find them.
- **The API route changes shape** to accept `review_notes`. Additive and
  optional.
- No change to auth, RLS, env, CI, lockfiles, or any Plaid path.

## Testing

Extend `tests/23-comps.spec.ts`. New cases:

1. one card shows at a time, and saving advances to the next
2. "3 of 7" counts down as houses are reviewed
3. Save is disabled with no choice picked, and says why
4. tapping a source lights that pill and marks the card as the one in hand
5. `Later` returns the comp to Still to check, and does not record a review
6. tab counts move when a review is saved
7. "Can't tell" skips the comp **and** the ARV basis line says how many were
   unreadable
8. the spec bar stays put while the list scrolls
9. **the whole tab fits 390px with no sideways scroll** — the existing
   `23-comps.spec.ts` already has this shape; follow it
10. review notes survive a reload

Run `npx playwright test tests/23-comps.spec.ts`, then `npm run build` and
`tsc`.

**One contradiction in the rules to resolve before work starts.** `CLAUDE.md`
§Testing says every major feature needs a passing Playwright test, no
exceptions. §Stop At The Commit says "No tests. Run `npm run build` and `tsc`
before stopping." I have planned for the Playwright test. The owner should say
which rule wins.

## Out of scope

- **Pending as a comp status.** It belongs in the notes but not in this
  branch, and for a reason worth recording: RentCast reports only Active and
  Inactive, so the app can never learn that a listing went under contract. A
  Pending status could only ever be hand-set, which makes it a change to
  manual comp entry rather than to the review flow. Its own plan.
- Verdict levers on "Doesn't work" — the Deal tab.
- Team sharing — needs RLS work.
- Every other tab.
- Swipe gestures. The buttons ship first; a gesture with no button is a
  feature only its author can find.
- Changing `cashReservesTightMonths` from 3 to 6.

## Approver

Not yet reviewed. Outcome and date to be recorded here.
