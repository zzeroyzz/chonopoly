# Plan: Playwright for journeys, Jest for cases

Status: **User approved** on 2026-10-23: "Approved:
plans/test-scale-back-playwright.md. Cut test/scale-back-playwright from main
and start; fix/reason-copy after." Self-reviewed first (see the end).
Branch: `test/scale-back-playwright`, cut from `main` at `107bf3f`.

## The problem

The owner: *"playwright was overdone by claude code .. we need to scale the
playwright back and write more jest test."*

The numbers bear it out. There are **153 Playwright tests in 10 files**.
`CLAUDE.md` asks for **one journey per feature, plus its 390px check**, with
every case in Jest. In practice most specs test cases through a browser:
labels, error wording, counts. That costs about 4 seconds each and breaks on
every rename.

| File | Tests | Lines |
|---|---|---|
| `01-auth` | 8 | 60 |
| `19-crm` | 4 | 329 |
| `20-mortgage-scenarios` | 13 | 450 |
| `21-buyer-profile` | 15 | 300 |
| `22-navigation` | 24 | 561 |
| `23-comps` | 46 | 1,126 |
| `24-screen` | 34 | 670 |
| `25-calculator-binding` | 7 | 349 |
| `27-recorded-sales` | 6 | 350 |
| `28-companies` | 5 | 164 |

The last full run: **146 passed, 24 failed, 8.6 minutes.**

## What is failing, and why (diagnosed 2026-10-23)

All 24 failures **pre-date #66**. The 5 in `20`, `21`, `25` and `27` were run
on `main` as it stood before #66 (`08679fa`) and failed the same way. #66 changed
nothing in the comps code (`git diff 08679fa..main` on `lib/comps`, the comps
panel and routes, and `23-comps.spec.ts` is empty), and `arv.ts` last changed
on 2026-10-21. **Every one is a test that fell behind the app. None is a
product bug.**

| Failing | Cause |
|---|---|
| 9 batch-add (`24-screen`) | The paste box now sits behind the "Add several" toggle (`add-mode-several`), which the tests never click |
| "no income on file" (`24-screen`) | It expects the tag to read "Set your income". The card's affordability tag shows the verdict ("Tight"), and the income prompt is the banner above the list. Stale. |
| 6 in `23-comps`: ARV $359,375 expected, $380,250 shown | The ARV now adjusts each comp for size ("$40 per sq ft of size difference"), added on 2026-10-21. The fixtures still expect the unadjusted average. |
| 2 in `23-comps`: "5 of 6 approved" | The panel now counts only reviewable comps ("5 of 5"), because Active listings are no longer reviewed |
| `23-comps`: Active listing not found | Active listings sit under the Listings filter now, per the design system |
| `23-comps`: "confirmed sale" missing | The manual comp form's wording was rewritten |
| `27`: "Renovated: use it" | The label is now "Renovated" |
| `21`: `getByLabel('Term')` | A new long-term tax rate field also matches "Term" |
| `20`: attach-address box not found | Fails identically before #66. It is a kept journey, so it is fixed in step 4, and the selector or flow is traced then. |
| 2 in `25` | Fail identically before #66. The kept journey is fixed in step 4, and the dropped one ("adds a version") moves to Jest. |

## Goal

About **34 Playwright tests**, each a journey or a 390px layout check that
only a browser can prove. Every case they used to cover is either a Jest test
against the function that decides it, or listed below as dropped with the
reason. The full suite goes green and runs in a fraction of the time.

## Stack

TypeScript, Jest (`ts-jest`, node environment, as configured), and
Playwright. **No new dependencies.**

React Testing Library would let Jest render components. It is a new
dependency, so it is **not** proposed. Where a case's logic lives inline in a
component, it is extracted into a plain function first (no behaviour change),
and the function is tested. That is the pattern `CLAUDE.md` already asks for:
"a unit test against the function, not the screen".

## What stays in Playwright (about 34)

| File | Keeps | Why a browser |
|---|---|---|
| `01-auth` | Wrong details show the error. Forgot-password there and back. Reset link with no code says so. (3) | Routing and form submit |
| `19-crm` | House detail at 390px with contact and activity. A hub tile opens its tab. (2) | Layout, and a click to a tab |
| `20-mortgage-scenarios` | Save a scenario, see it listed, open it back into the form. Attach an address to an Unassigned save. The grouped list at 390px. (3) | Journeys and layout |
| `21-buyer-profile` | The first-run modal takes named debts and gives a verdict without leaving. Defaults saves and says so. Settings, defaults and calculator at 390px. (3) | Journeys and layout |
| `22-navigation` | The nav reaches every section, and the active tab follows. The shell survives a tab change. Old routes redirect (one parametrised test). The house page's tabs switch. House page at 390px. Without a photo, the sheet clears the facts. Editing house facts saves, including a photo link. Save stays reachable at 390px. (8) | Routing, layout, and the z-index trap |
| `23-comps` | Refresh fills an empty tab, and a double tap sends one request. Skipping a comp moves the ARV. A hand-entered comp is saved as a sale. Forcing a refresh confirms and sends `force`. The comps tab, form and confirm at 390px. (5) | The request a click makes, and layout |
| `24-screen` | Photo card: photo, fallback, opens the house. The row and the map stay linked. The screen at 390px with 44px targets. Pasting several addresses adds them, at 390px. (4) | Journeys, the map, and layout |
| `25-calculator-binding` | Open a house, run the numbers, save: one analysis, no new house. The modal at 390px, with Save visible. (2) | Journey and layout |
| `27-recorded-sales` | Recorded sales show as Sold, and the ARV is built from them, at 390px. (1) | Journey |
| `28-companies` | Adding a company sends what was typed. A portfolio house opens. The screens at 390px. (3) | Journeys and layout |

Where two old tests were the same journey, they merge into one. For example,
"saving lists it" and "opening puts it back" become one save-and-reopen test.

## What moves to Jest

Each one is tested against the function that decides it. Many already are,
and those Playwright copies simply go:

| Cases | Jest home |
|---|---|
| Verdict labels and reasons, "Set your income", no resale price | `verdicts.test.ts` (exists) |
| Card price wording, steps count and next step, "Resale price not checked yet" | **new** `cardCopy.test.ts`, on functions extracted from `PropertiesPage` |
| Server order kept | `sortScreenRows` in `screenRow.test.ts` |
| Map unplaced count, pin labels | `mapPins.test.ts` (exists) |
| Paste parsing, bad lines, duplicates, probable matches | `parseAddressLines.test.ts`, `addressDedupe.test.ts` (exist) |
| Batch keeps prices and never calls RentCast | `batchPrice.test.ts` (exists, plus one case) |
| Every comps error and status message: no key, quota out, nothing found, a 500 with a reason or an empty body, locked or unlocked, the cap, the saved response, the basis line, and the empty ARV card | **new** `compsMessages.test.ts`, on the functions that pick each message (extracted where inline) |
| Integrations: usage, the 80% warning, what still works, the missing key, a deployment that never calls | `rentcastQuota.test.ts` (exists), plus new cases for the wording |
| A non-owner cannot force a refresh | the refresh route's permission check, as `batchPrice` tests its route |
| Fixer-upper flag, a listing keeping "Removed", skipping moving the ARV | `arv.test.ts`, `fromPropertyRecords.test.ts` (exist) |
| Scenario versioning, grouping by house, Unassigned | `scenarios.test.ts`, `analyses.test.ts` (exist) |
| The calculator can never create a house | that route's handler, the same way |
| Property type as a label, the Tools list | `propertyTypeLabel`, and the Tools list constant |
| A suppressed phone number and its reason | **new** case on the function that decides it |

**Before any Playwright test is removed**, its row in a mapping table
(appended to this file in step 2) says which Jest test now holds its case,
or why it is dropped. **Nothing leaves without a row.**

## What is dropped outright

These check things that are not behaviour, or are already proven by a kept
journey:

- The password field starts hidden, and its visibility toggle.
- "Save is disabled until named" and "the save control is on the page". The
  save journey covers both.
- Duplicate 390px checks: one per screen is kept, not one per panel.
- "The routes the modal replaced are gone", and "the old module hub is gone".
  The redirect test covers them.
- Copy-only checks, such as "the edit form says hand-entered facts win". Copy
  belongs in Jest when a function chooses it. Static text needs no test.

Each one is still listed in the mapping table.

## Approach

1. ~~Diagnose the failures.~~ Done, see above: all 24 are stale tests.
2. **Write the mapping table**: every one of the 153 tests marked keep,
   Jest (named), or dropped (reason). Appended to this file.
3. **Extract the inline rules** into functions (no behaviour change), and
   write the Jest tests. Run Jest.
4. **Cut the specs** down to the kept journeys, merging where noted, and
   fixing the stale selectors (the "Add several" toggle and the two "Term"
   fields).
5. **Make every spec runnable on its own.** `23-comps` currently depends on
   state from earlier specs.
6. Full Playwright suite, full Jest, `tsc`, lint, and `npm run build`.
   Before and after counts and run times go in the hand-off.

## Branch

#66 merged on 2026-10-23, so this is cut fresh from `main` as
`test/scale-back-playwright`. The approved `fix/reason-copy` waits behind it,
one branch at a time, unless the owner wants that one first.

## Risks

- **Removing tests is Tier 2.** This plan is the ask. The mapping table makes
  every removal traceable.
- **Diagnosis may find real bugs**, most likely in comps. Those are reported,
  not quietly fixed here.
- **Extracting functions from components** touches UI files. Each extraction
  is a move with no behaviour change, and the kept journeys prove the screens
  still work.
- **The Playwright CI job is still commented out** in
  `.github/workflows/ci.yml`. Turning it back on is a config change, so it is
  **out of scope** and listed as a follow-up.

## Testing

The suite itself is the deliverable. Done means:
- Full Jest passes.
- Every kept Playwright spec passes, alone and in the full run.
- Total Playwright run time is reported against the 8.6 minutes it is now.

## Out of scope

- The CI workflow.
- New features.
- Product bugs found during diagnosis, which are reported first.
- `CLAUDE.md`'s testing section, which already says this. It is the specs that
  drifted.

## Approver (self-review)

Written by the same Claude that will build it, at the owner's standing
instruction. **It is not an independent review.**

- **Against "never delete or weaken a failing test to make it pass"**: met by
  diagnosing before removing, and by the rule that no test leaves without a
  mapping row. Failing tests are not deleted *because* they fail. The kept
  journeys are fixed until they pass.
- **No new dependency.** React Testing Library was considered and left out.
- **Refactor first**: functions are extracted, not duplicated into the tests.
- **Changed by this review**:
  - The first draft dropped the batch-add journey with the other batch tests.
    It is the only browser proof that pasting works, so it is kept and fixed.
  - The draft deleted the stale failing tests straight away. It now diagnoses
    them first.

**Recommendation:** approve. Step 1 (diagnosis) is done and found no product
bugs.
