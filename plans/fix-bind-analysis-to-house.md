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

### New work — the route-keyed design

| File | Change |
|---|---|
| `app/properties/[id]/numbers/new/page.tsx` | **New.** Calculator keyed by the house's UUID in the path |
| `app/properties/[id]/numbers/[analysisId]/page.tsx` | **New.** Opens one analysis; saving adds a version |
| `components/mortgage/MortgageCalculator.tsx` | Accept `propertyId` / `scenarioId` as **props**; keep the `window.location` fallback for `/tools/mortgage`. Removes the `useSearchParams` suspension trap on the new routes rather than working around it |
| `components/crm/PropertyDetailPage.tsx` | Both links point at the new routes instead of `?property=` |
| `lib/mortgage/storage.ts` | Draft key becomes per-house (`mortgageCalculatorInputs:<propertyId>`), so house A's draft cannot surface on house B. **Tier 2: exported signature change** to `loadInputs`/`saveInputs` |
| `tests/25-calculator-binding.spec.ts` | Refactor to the new routes; add reload-keeps-binding and version-2 assertions |
| `tests/unit/scenarios.test.ts` | Extend for the storage key change |

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
2. Add the two route-keyed pages; `MortgageCalculator` takes props.
3. Repoint both `PropertyDetailPage` links.
4. Per-house draft key in `storage.ts`.
5. Tighten the guard: confirm a bound save with an address fails loudly, and add
   the unit coverage for it.
6. Refactor `25-calculator-binding.spec.ts` onto the new routes, add the two new
   cases.
7. `npm run build`, `tsc`, `lint`, `jest`, then the Playwright spec.

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
1. Open a house → Run the numbers → save → back on the house: one property, one
   analysis, **no new pipeline entry**.
2. Save again → same analysis, **version 2**.
3. Reload mid-calculation → binding survives.
4. `/tools/mortgage` still asks for an address (regression guard).

No live RentCast calls: tests run on fixtures. No production writes.

## Out of scope

- Cleaning up the duplicate property and the stray analyses in production.
- The six fixture comps on 1653 Sylvan Rd SW.
- The missing `rentcast_requests` row.
- Phase 3 (Estimate, Visit, Check), which stays paused.
