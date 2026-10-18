# Bind a saved analysis to the house it was opened from

**Status: User approved (shape) — 2026-10-18.** The owner chose the single-PR
shape: branch off `main`, carry the four orphaned commits forward, then add the
route-keyed pages. **Approver review did not run** — no separate Approver
instance was available this session, and Claude Code cannot act as the Approver
for work it implements. Flagged rather than skipped quietly.

Phase 3 of the rebuild plan is paused until this ships.

---

## What the audit found

Read-only, no writes. Three findings, and the first one changes the diagnosis.

### 1. The fix for this bug already exists. It was merged into the wrong branch.

| PR | Head | **Base** | Merged |
|---|---|---|---|
| #41 | `feat/screen-and-verdicts` | **`main`** | 18:25:19Z |
| #42 | `fix/bind-calculator-to-property` | **`feat/screen-and-verdicts`** | 18:52:20Z |

#42 was merged into `feat/screen-and-verdicts` **27 minutes after that branch had
already been merged to main**. Its commits never reached main:

```
git merge-base --is-ancestor a7be87e origin/main  →  NO
```

GitHub deployments agree. The only Production deploy is `4bb3874` (#41's merge
commit). #42's merge commit `61ea05b` got a **Preview** deploy and nothing else.

So production is running code that predates the fix, which is why the bug is
still live. This is not a code defect to re-diagnose — it is undeployed work.

### 2. Four commits are orphaned, two of them unpushed

`fix/bind-calculator-to-property` sits at main + 4 commits:

| Commit | On origin? | In main? |
|---|---|---|
| `a7be87e` fix(mortgage): bind the calculator to a property | yes | **no** |
| `c4540f7` test(nav): stub the screen endpoint, stop the shell suspending | yes | **no** |
| `4306541` fix(properties): make a house openable from the Properties list | **no** | **no** |
| `17ac6ef` chore: drop an eslint-disable that is no longer needed | **no** | **no** |

The last two exist only on this machine. Any plan has to carry all four forward.

### 3. What production looks like today

`components/crm/PropertyDetailPage.tsx` on `origin/main`:

- "Run the numbers" is **plain text**. The link is the words "mortgage
  calculator" → `/tools/mortgage`, with no house binding.
- The copy reads *"and save with this address"* — it instructs the user to
  retype an address already on file.
- Existing analyses link to `/tools/mortgage?scenario=<id>`, also unbound.

Retyping is what duplicates the house: `upsertProperty` hashes the typed address,
a different spelling hashes differently, and the save creates a second property.

---

## Production data, as of the audit

Nothing was merged, edited or deleted.

### properties — 3 rows, all created 2026-10-18

| id | address_line1 | city / zip | origin | review? | created_at |
|---|---|---|---|---|---|
| `8c691770` | 1653 Sylvan Rd SW | Atlanta 30310 | `crm` | no | 18:54:14 |
| `42c43a40` | 1900 Windsor Dr SW | Atlanta 30311 | `crm` | no | 19:08:15 |
| `8b14e8d2` | `1900 Windsor Dr SW Atlanta, GA, 30311` | **null / null** | `analysis` | **yes** | 19:12:42 |

`8b14e8d2` is the duplicate the bug produced. The whole address is crammed into
`address_line1` with `city` and `zip` null, `origin: analysis`,
`needs_address_review: true`, and a different hash (`ffd2a998…` vs `aef3fd1c…`)
from the real row for the same house.

### pipeline_entries — 2 rows

| id | property | stage | source | created_at |
|---|---|---|---|---|
| `8aa7762f` | `8c691770` 1653 Sylvan Rd SW | `new_lead` | manual | 18:54:14 |
| `207c3c72` | `42c43a40` 1900 Windsor Dr SW | `new_lead` | manual | 19:08:15 |

**The duplicate has no pipeline entry.** Worth being precise about: the bug
creates a duplicate *property*, not a duplicate pipeline entry. The duplicate
appears under Properties and not on the board.

### analyses — 6 rows

| id | property | label | primary | archived | created_at |
|---|---|---|---|---|---|
| `3e55f8dd` | **null** | 1653 Sylvan Rd SW, Atlanta, GA 30310 | no | 18:16:23 | 10-16 23:04 |
| `913e0066` | **null** | 1653 Sylvan Rd SW, Atlanta, GA 30310 | no | 18:18:52 | 18:17:10 |
| `e9bdd94d` | **null** | 1653 Sylvan Rd SW, Atlanta, GA 30310 | no | — **live** | 18:19:33 |
| `4b7d3dae` | `8c691770` 1653 Sylvan Rd SW | 1653 Sylvan Rd SW | **yes** | 19:13:40 | 18:55:50 |
| `91864e32` | `8b14e8d2` **duplicate** | 1900 Windsor Dr SW, Atlanta, GA 30311 | no | 19:13:39 | 19:12:15 |
| `e1e4cb52` | `8b14e8d2` **duplicate** | 1900 Windsor Dr SW Atlanta, GA, 30311 | no | — **live** | 19:13:48 |

Net live state: **1900 Windsor Dr SW exists twice** — the real house
(`42c43a40`, pipeline entry + 15 comps, no analysis) and the duplicate
(`8b14e8d2`, one live analysis, no comps, no pipeline entry). The analysis landed
on the wrong row, exactly as reported.

Also: `1653 Sylvan Rd SW`'s only house-attached analysis (`4b7d3dae`, the
primary) is archived, leaving one unattached live analysis.

`analysis_versions`: **0 rows.** No versioning has run in production yet.

### Fixture data in production — the Phase 3 question, answered

| Table | Finding |
|---|---|
| `valuations` | **0 rows.** No fixture valuations. |
| `property_comps` | **21 rows. 6 are fixtures.** |

The 6 on `8c691770` (1653 Sylvan Rd SW, Atlanta) are the Duluth addresses from
`lib/rentcast/fixtures/valueEstimate.json` — 214 Oakmont Dr, 77 Brookhaven Ln,
1455 Sycamore Ct, 3020 Fieldstone Way, 58 Willow Bend Rd, 905 Hollis Park Dr,
all `Duluth, GA 30096`, all written at 18:56:04. The `rentcast_requests` row one
second earlier is `billable: false`, confirming a mock serve — a local dev
session pointed at the production database.

The other 15, on `42c43a40`, are genuine Atlanta comps for that ZIP.

**Reported, not fixed** (out of scope here, and nothing was deleted):
1. Six fixture comps sit on a real Atlanta house. Any ARV computed from them
   would be built on Duluth prices.
2. Those 15 real comps have **no `rentcast_requests` row** at 19:11:43. The
   usage log is missing a request that happened, and undercounting is the
   dangerous direction against a 50/month allowance.
3. **5 billable RentCast requests** are already logged this month (3×200, 2×403).

---

## Goal

Make "Run the numbers" on a house save an analysis onto **that house**, keyed by
UUID in the URL, with a server-side guard that refuses to create a property when
a save is bound. Land it on `main` so it actually deploys.

## Stack

TypeScript strict, Tailwind, Next.js 16 App Router, Supabase. No new packages.

## Scope

### Already built in #42 — carried forward, not rewritten

Verified by reading the code. These satisfy parts of the spec already:

| Spec item | Where it already lives |
|---|---|
| Bound save skips `upsertProperty` entirely | `scenarioService.ts:353–374` |
| `property_id` + address → **400, loud** | `app/api/mortgage/scenarios/route.ts:77–82` |
| Bound save onto another context's house → 404 | same file, `:86–91` |
| Header naming the bound house | `MortgageCalculator.tsx:193–215`, `data-testid="bound-property"` |
| A bound calculator hides the address field | covered by `tests/25-calculator-binding.spec.ts:130` |
| First analysis on a house claims `is_primary` | `scenarioService.ts:401–415` |
| 10 Playwright tests at 390px | `tests/25-calculator-binding.spec.ts` |

### New work — the modal design

**Revised 2026-10-18, before review**, at the owner's direction. The first
implementation used two route-keyed pages, `/properties/[id]/numbers/new` and
`/numbers/[analysisId]`. They worked and were tested, but the house is already
on screen when you want its numbers, so the calculator is a modal over that
page instead. The pages are **removed and refactored into the modal** — no
parallel version. They survive only in this branch's intermediate commits.

| File | Change |
|---|---|
| `components/mortgage/CalculatorCore.tsx` | **New.** The calculator extracted from `MortgageCalculator` so the page and the modal share one copy. Owns inputs, the profile, the resolve and the panels; the host owns its chrome |
| `components/mortgage/NumbersModal.tsx` | **New.** Centered modal over the house. Header names the house; body scrolls; footer is sticky with Name, Cancel and Save. Closing dirty asks first |
| `lib/mortgage/scenarioClient.ts` | **New.** One `saveAnalysis` request, shared by the modal and the scenario bar. **Has no address parameter at all**, so no caller can create a property |
| `components/crm/PropertyDetailPage.tsx` | Opens the modal from `?numbers=new` / `?numbers=<analysisId>`, written with `history.pushState` so the server component underneath is not re-run. `popstate` closes it, so Back leaves the modal and not the page. On save: close, reload analyses and detail, show the Numbers tab |
| `components/mortgage/MortgageCalculator.tsx` | Reduced to AppShell + `CalculatorCore`. No house, no address, no required save |
| `components/mortgage/ScenarioBar.tsx` | The three address inputs are replaced by an optional **"Save to a house"** picker that searches existing houses by address via `/api/properties/screen`. `boundProperty` prop removed — the modal supersedes it |
| `components/mortgage/fields.tsx`, `InputPanel.tsx` | Optional `testId` on `NumberField`, used by the price field |
| `lib/mortgage/storage.ts` | Draft key becomes per-house (`mortgageCalculatorInputs:<propertyId>`). Additive optional parameter, so no call site breaks. Plus `hasDraft`, which `loadInputs` cannot answer |
| `lib/mortgage/resolveInputs.ts` | `housePrefill`, a pure function seeding a new analysis from the house |
| `app/properties/[id]/numbers/**` | **Removed**, refactored into the modal |
| `tests/25-calculator-binding.spec.ts` | Rewritten for the modal |
| `tests/20-mortgage-scenarios.spec.ts` | The three tests that saved a typed address rewritten onto the picker. One of them — "a second save at the same address is flagged for review" — tested a lossy address match that can no longer happen here, so it became "the calculator cannot create a house" |
| `tests/19-crm.spec.ts` | Stub updated to the property detail endpoint (see below) |

**Prefill.** Price and reno budget come from the house's **primary financing
analysis** (`inputs.homeValue`, `inputs.renovationBudget`) — there is no price
column on `properties`; `purchase_price` belongs to the legacy cash-flow columns
on `analyses`. Taxes come from `properties.annual_taxes`. Everything else comes
from the profile and defaults via `resolveInputs`, unchanged.

### Migrations

**None.** No schema change is needed — `analyses.property_id` already exists and
is nullable with `ON DELETE SET NULL` after Phase 1. Nothing to approve or run.

## Approach

1. Branch off `origin/main`, carrying the four orphaned commits forward.
2. Per-house draft key in `storage.ts`, plus `housePrefill`.
3. Extract `CalculatorCore` from `MortgageCalculator`.
4. Build `NumbersModal` on top of it; mount it from `PropertyDetailPage` with
   `?numbers=` in the URL.
5. Remove the route-keyed pages.
6. Replace the scenario bar's address inputs with the house picker.
7. Rewrite the specs for the modal.
8. `npm run build`, `tsc`, `lint`, `jest`, Playwright at 390px.

## Two things found along the way, reported not fixed

**1. `verdict.actual` on the results panel reads the draft, not the profile.**
`defaultInputs()` zeroes `grossMonthlyIncome` and `storage.ts` strips it, so the
figure is always `0` while the required figure beside it is built from the real
profile. Pre-existing, and preserved exactly through the extraction — a refactor
about binding must not quietly change a verdict on screen.

**2. One path can still create a property outside Add.**
`POST /api/mortgage/scenarios/[id]/address` attaches an address to an
unassigned analysis and calls `upsertProperty`. It is the Phase 1 "Unassigned"
affordance and is unreachable from the calculator now, but it contradicts the
revised Decided rule. Left alone because closing it is an API change the owner
did not ask for; recommended as a follow-up.

## Refactors, not duplicates

`MortgageCalculator` is edited in place to take props — no second calculator
component. `scenarioService.saveScenario` keeps its signature. The existing
binding spec is refactored, not replaced by a parallel file.

## Risks

- **Tier 2: `storage.ts` exported signature change.** Existing drafts under the
  old global key are migrated the way `migrateDpaAmount` already does.
- **Tier 2: pushing and opening a PR.** Authorised in the owner's message.
- **The orphaned commits.** Two exist only on this machine. They are carried
  forward before anything else, and `git switch` does not endanger them.
- **`/tools/mortgage` keeps the `?property=` fallback** so an old bookmark still
  binds instead of silently creating a duplicate.
- **This does not clean up the four bad rows already in production.** Separate
  decision, separate authorisation; nothing is deleted here.

## Testing

**Unit (jest).** Bound save ignores an address and creates no property; the
per-house draft key isolates houses; the old-key migration.

**API.** `property_id` + address → 400. `property_id` for another context → 404.
Bound save writes `property_id` and leaves `properties` untouched.

**Playwright at 390px** — the exact path, as specified:
1. Open a house → Run the numbers → Save → **modal closes**, the Numbers tab
   shows the analysis: one property, one analysis, **no new pipeline entry**.
2. Save an existing analysis → same row, **version 2**, shown on screen.
3. Reload with the modal open → same house, modal still open.
4. Closing dirty asks first; Keep editing preserves the work, Discard saves
   nothing.
5. The modal scrolls inside and **Save stays in the viewport** at 390px.
6. The modal asks for no address, and the removed routes 404.

No live RentCast calls: tests run on fixtures. No production writes.

## Out of scope

- Cleaning up the duplicate property and the stray analyses in production.
- The six fixture comps on 1653 Sylvan Rd SW.
- The missing `rentcast_requests` row.
- Closing the `scenarios/[id]/address` property-creating path.
- Phase 3 (Estimate, Visit, Check), which stays paused.
