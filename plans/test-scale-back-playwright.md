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

## Mapping table (step 2, written 2026-10-23, before any test was removed)

**K** = kept in Playwright, with the merge target in brackets. **J** = moved to
Jest, naming the test that holds it. **D** = dropped, with the reason. Files
marked *new* are created in step 3. "Extract" means the rule leaves a
component for a plain function, with no behaviour change.

### 01-auth (8 → 3)
| Test | → |
|---|---|
| renders the login form | K [wrong details show the error] |
| password field starts hidden | D: the browser's default attribute, not app behaviour |
| toggles password visibility | D: a DOM attribute flip, with no rule behind it |
| shows an error on invalid credentials | **K** wrong details show the error |
| switches to forgot-password mode | **K** forgot-password there and back |
| forgot-password form has an email field | K [forgot-password there and back] |
| returns to login from forgot-password mode | K [forgot-password there and back] |
| reset page: error when no code | **K** |

### 19-crm (4 → 2)
| Test | → |
|---|---|
| a suppressed number stays visible, struck through | J: `crm.test.ts` (suppression rule), plus extract "no tel link when suppressed" if it is inline |
| detail shows property, contact, activity at 390px | **K** |
| the hub opens the tab behind a tile | **K** (tile wording is already in `detailsHub.test.ts`) |
| the hub fits 390px | K [detail at 390px] |

### 20-mortgage-scenarios (13 → 3)
| Test | → |
|---|---|
| the save control is on the page | D: the save journey proves it |
| save is disabled until named | J: *new* `groupScenarios.test.ts`, extract `isSaveableName` (whitespace is not a name) |
| saving lists it with price and payment | **K** save, list, reopen, delete |
| opening puts the numbers back | K [save, list, reopen, delete] |
| same name keeps one row, bumps the version | J: `scenarios.test.ts`, `saveScenario` versioning against a stand-in database |
| deleting removes it | K [save, list, reopen, delete] |
| the saved list fits 390px | K [grouped list at 390px] |
| a picked house groups the save | J: `groupScenarios.test.ts`, extract `groupByProperty` |
| two saves on one house: one heading, two rows | J: `groupScenarios.test.ts` |
| the calculator cannot create a house | D: no address field is static markup. The 25 journey proves saves carry no address and write no house. |
| no house lands under Unassigned | J: `groupScenarios.test.ts` |
| an Unassigned save can have an address attached | **K**, rewritten: attaching is now a house picker (`attach-house-*`), not a typed address. That is why it failed. |
| the grouped list fits 390px | **K** |

### 21-buyer-profile (15 → 3)
| Test | → |
|---|---|
| with no profile, the calculator asks for income | J: `verdicts.test.ts` (`needsProfile`) |
| the first-run modal takes named debts | **K** first-run: named debts → verdict, no leaving |
| saving the modal gives a verdict | K [first-run] |
| the modal is first-run only | K [first-run: afterwards it is read-only, with "Edit in Settings"] |
| income is entered once and reused | J: `resolveInputs.test.ts` (profile applied to every house) |
| a second house reuses the profile | J: `resolveInputs.test.ts` |
| settings lists each debt | **K** settings shows the profile, the tabs move, and defaults save |
| settings fits 390px | **K** settings, defaults and calculator at 390px |
| the calculator fits 390px | K [390px] |
| the defaults screen edits loan and flip costs | D: prefilled values are `defaults.ts` (Jest-covered). Its "Term" selector also matches the tax field now, which is why it failed. |
| assistance fields appear only when on | D: one boolean, no rule |
| defaults saves and reports it | K [settings journey] |
| the settings tabs move | K [settings journey] |
| defaults fits 390px | K [390px] |
| defaults explains itself with no profile | D: static copy on one condition |

### 22-navigation (24 → 8)
| Test | → |
|---|---|
| the bottom bar holds five destinations | K [the nav reaches every section] |
| the nav reaches every section | **K** |
| the last slot is your avatar | K [nav] |
| the hub opens each of four areas | K [nav] |
| the hub fits 390px | K [house page at 390px, which also loads the hub] |
| the shell survives a tab change | **K** |
| the active destination follows the route | K [nav] |
| Tools lists only calculators that exist | J: the Tools list, if it is a constant, otherwise D (static) |
| `${from}` redirects | **K** one parametrised test (plus the 25 "routes gone" and "old module hub") |
| a property deep link keeps its id | K [tabs switch] |
| the property page has six tabs and they switch | **K** |
| the Numbers tab lists analyses | K [tabs switch] |
| Rehab is the estimator | K [tabs switch] |
| the property page fits 390px | **K** |
| without a photo, the sheet clears the facts | **K** |
| the old module hub is gone | K [redirects] |
| property type reads as a label | J: *new* case for `propertyTypeLabel` in `screenRow.test.ts`'s sibling `specLine.test.ts` |
| house facts can be edited | **K** edit, cancel, photo link |
| the edit form says hand-entered facts win | D: static copy |
| cancelling the edit form changes nothing | K [edit] |
| the edit form fits 390px | K [Save reachable at 390px] |
| the edit form opens over the page | K [Save reachable at 390px] |
| Save stays reachable at 390px | **K** |
| a pasted photo link saves | K [edit] |

### 23-comps (46 → 6)
| Test | → |
|---|---|
| skipping a comp moves the ARV | **K** (asserts the ARV moves, not a count) |
| approving again restores the ARV | J: `arv.test.ts` (included vs skipped), plus the sale-price prompt rule |
| comps show Removed rather than Sold | J: `arv.test.ts` status labels |
| refresh pulls comps into an empty tab | **K** refresh fills the tab, and a double tap sends one request |
| no API key says so | J: *new* `refreshMessages.test.ts`, moving the route's reason map to `lib/comps/refreshMessages.ts` |
| an exhausted quota is distinct | J: `refreshMessages.test.ts` |
| no comps found is reported | J: `refreshMessages.test.ts` |
| a failed refresh keeps the comps | **K** a failed refresh says why and keeps the comps |
| a hand-entered comp is a confirmed sale | **K** manual comp: saved as Sold, with its date, removable |
| the basis label counts the manual sale | J: `arv.test.ts` (`basisLabel`) |
| only hand-entered comps can be removed | K [manual comp] |
| the Comps tab fits 390px | **K** comps tab, form, confirm and lock row at 390px, ARV and Refresh apart |
| the manual form fits 390px | K [390px] |
| ARV and Refresh share the top row | K [390px] |
| a manual comp with no date shows none | J: `arv.test.ts` (`compDate`) |
| a manual comp records its date | K [manual comp] |
| Integrations usage against the limit | J: *new* `integrationStatus.test.ts`, extract from `IntegrationsPanel` |
| Integrations warns at 80% | J: `integrationStatus.test.ts` |
| Integrations says what still works | J: `integrationStatus.test.ts` |
| Integrations reports a missing key | J: `integrationStatus.test.ts` |
| Integrations reachable at 390px | K [settings 390px, in 21] |
| a 500 with a reason shows it | J: *new* `readErrorMessage.test.ts`, one function shared by the comps panel and the Properties list |
| a 500 with an empty body | J: `readErrorMessage.test.ts` |
| a crashed refresh leaves comps alone | K [failed refresh keeps the comps] |
| a locked house says when | J: *new* `refreshControls.test.ts`, extract from `CompsPanel` |
| locked offers Refresh early | J: `refreshControls.test.ts` |
| unlocked offers Refresh | J: `refreshControls.test.ts` |
| forcing confirms and says the cost | **K** force: confirm, cancel spends nothing, accept sends `force` |
| cancelling spends nothing | K [force] |
| accepting sends force | K [force] |
| the confirm panel fits 390px | K [390px] |
| a non-owner cannot force | J: `refreshControls.test.ts` |
| at the cap Refresh is removed, reason given | J: `refreshControls.test.ts` |
| manual comps still work at the cap | D: the manual form does not read refresh status; the manual comp journey proves it works |
| comps say when from the saved response | J: `refreshControls.test.ts` (source labels) |
| rebuild offered, never calls out | J: `refreshControls.test.ts` (offered) |
| rebuild hidden with nothing saved | J: `refreshControls.test.ts` |
| the lock row fits 390px | K [390px] |
| a double tap sends one request | K [refresh fills the tab] |
| disabled while running | K [refresh fills the tab] |
| losing the lock race | J: `refreshMessages.test.ts` (in_flight) |
| Integrations: a deployment that never calls | J: `integrationStatus.test.ts` |
| no key hides Refresh and says why | J: `refreshControls.test.ts` |
| manual comps work with no key | D: as at the cap |
| an empty ARV card says one thing | J: `arv.test.ts` (`basisLabel` empty), or extract the card's rule |
| the basis line returns with a number | J: `arv.test.ts` (`basisLabel`) |

### 24-screen (34 → 4)
| Test | → |
|---|---|
| both verdicts | J: `verdicts.test.ts` |
| each verdict carries its reason | J: `verdicts.test.ts` |
| the card leads with price, address, specs | J: `specLine.test.ts` and *new* `cardSteps.test.ts` (price wording) |
| no listing price says so | J: `cardSteps.test.ts` |
| no ARV says so | J: `verdicts.test.ts` |
| nothing approved asks for a review | J: `cardSteps.test.ts`, extract `resaleUnchecked` |
| a checked price does not ask | J: `cardSteps.test.ts` |
| no income on file | J: `verdicts.test.ts`. The Playwright copy was stale: the prompt is the banner, not the tag. |
| an address flagged for review | J: `screenRow.test.ts` (flag passes through) |
| a listing link is one tap away | K [photo card journey] |
| the steps count opens the next step | J: `cardSteps.test.ts`, extract `cardSteps` |
| a finished house shows four of four | J: `cardSteps.test.ts` |
| the server's order is kept | J: `screenRow.test.ts` (`sortScreenRows`) |
| an empty screen points at adding | D: static copy on one condition |
| a filter showing nothing offers a way back | D: one state flip and static copy |
| a failed load says why | J: `readErrorMessage.test.ts` |
| the screen fits 390px | **K** |
| photo card: photo, fallback, opens | **K** (also the listing link and the card-wide link) |
| the row and the map are linked | **K** |
| a house the map cannot place is counted | J: `mapPins.test.ts` |
| a map with no placed houses says why | D: static copy on `pins.length === 0` |
| pasting five addresses adds five | **K**, fixed to click "Add several" first. That is why it failed. |
| one address reads as one house | J: `parseAddressLines.test.ts` |
| a bad line is named | J: `parseAddressLines.test.ts` |
| a probable match is flagged | J: `addressDedupe.test.ts` |
| batch add does not call RentCast | J: `batchPrice.test.ts`, *new* case |
| the result links on to the screen | K [pasting] |
| submit disabled with nothing pasted | D: one `trim()` check |
| a failed batch says why, keeps the text | J: `readErrorMessage.test.ts` (the why). Keeping the text: D, a textarea not being cleared. |
| the add screen fits 390px | K [pasting] |
| a row links to its property | K [photo card] |
| the whole card is clickable | K [photo card] |
| no pipeline entry still opens | K [photo card] (the href never uses the entry) |
| the listing link opens the listing | K [photo card] |

### 25-calculator-binding (7 → 2)
| Test | → |
|---|---|
| open, run, save: one analysis, no house | **K**, with the reload returning to the same house |
| saving an existing analysis adds a version | J: `scenarios.test.ts` (`saveScenario` versioning) |
| a reload comes back to the same house | K [journey] |
| closing with unsaved changes asks first | D: a confirm dialog with no rule behind it |
| Save stays visible at 390px | **K** |
| the modal asks for no address | D: static markup. The journey asserts no address is sent. |
| the routes it replaced are gone | K [redirects in 22] |

### 27-recorded-sales (6 → 1)
| Test | → |
|---|---|
| recorded sales show as Sold, county record | **K** recorded sales at 390px: Sold, county record, ARV built |
| the ARV is built from sales alone | J: `arv.test.ts` |
| a listing keeps Removed beside sales | J: `arv.test.ts` (status labels) |
| a possible fixer-upper is flagged | J: `fromPropertyRecords.test.ts` |
| skipping the flagged sale moves the ARV | J: `arv.test.ts` |
| the ARV tab fits 390px | K [recorded sales] |

### 28-companies (5 → 3)
| Test | → |
|---|---|
| an empty list says what goes there | D: static copy on one condition |
| adding a company sends what was typed | **K** |
| a portfolio shows, and each house opens | **K** (price wording is already in `companies.test.ts`) |
| adding a house goes through the normal form | K [portfolio] |
| the companies screens fit 390px | **K** |

**Totals:** 153 → **35** Playwright tests. 34 were planned. The extra one is
comps' "a failed refresh keeps the comps", kept because the tab emptying
itself was a real bug once, and only a browser shows it.

## Outcome (2026-10-23)

| | Before | After |
|---|---|---|
| Playwright tests | 153 | **35** |
| Playwright result | 146 passed, 24 failed | **35 passed, 0 failed** |
| Playwright run time | 8.6 min | **48 s** |
| Jest tests | 548 | **600** (all pass) |
| `tsc`, `npm run build` | pass | pass |
| Lint | 13 errors, 22 warnings | 13 errors, 20 warnings (the errors pre-date this branch, in files or lines it did not change) |

**Every spec now runs on its own.** `23-comps` used to fail 13 when run alone.

**Rules lifted out of components** (no behaviour change), each now tested in
Jest:
- `lib/comps/refreshControls.ts`, from `CompsPanel`
- `lib/comps/refreshMessages.ts`, from the refresh route
- `lib/http/readJsonResponse.ts`, one copy instead of two, shared by
  `CompsPanel` and `PropertiesPage`
- `lib/rentcast/integrationStatus.ts`, from `IntegrationsPanel`
- `lib/screen/cardSteps.ts`, from `PropertiesPage`
- `lib/mortgage/groupScenarios.ts`, from `ScenarioBar`
- `needsSalePrice` in `lib/comps/types.ts`, from `CompsPanel`

There is also a shared test helper, `tests/unit/fakeDatabase.ts`.

**Why the kept journeys had been failing.** All were stale tests or stubs, and
none was a product bug:
- **Batch add** never pressed "Add several".
- **The attach stub** still created a house from a typed address.
- **The calculator stub** answered the Properties list with a house body, and
  sent analyses without `inputs`. The page crashed on both.

**Departures from the mapping table:**
- "Tools lists only calculators that exist" is **D**, not J. It checks that
  two cards are absent, which is static. The redirects test sends those old
  routes to Properties.
- The dead pipeline fixtures `ROWS` and `COUNTS` in `19-crm.spec.ts` were
  removed. Nothing had read them since the pipeline went.
- The comps stub's five unused refresh modes went with the tests that used
  them.

**Follow-up, not done:** re-enabling the Playwright job in
`.github/workflows/ci.yml`. At 48 seconds and green, it is now cheap to run
on every PR. It is a config change, so it is the owner's call.
