# Mortgage Calculator — Implementation Plan

Plan only. No code has been written. Awaiting approval per CLAUDE.md.

Spec: `plans/MORTGAGE-CALCULATOR-SPEC.md`
Codebase surveyed: `app/`, `components/`, `lib/`, `tests/`, `DESIGN_AUDIT.md`

---

## 0. The one decision that blocks everything else

**The spec asks for a "standalone page." This app does not have pages.**

Everything the user sees after login lives at a single route, `/finances`, rendered by
`components/BudgetClient.tsx` (2,588 lines). Navigation is a `ViewState` union held in
component state and mirrored to a `?tab=` query param:

```ts
// BudgetClient.tsx:1786
const VALID_TABS = ["overview","manage","budgets","goals","debts","bills",
                    "transactions","analytics","profile"] as const;
```

The only real routes are `/login`, `/setup`, `/profile`, `/invite/[token]`,
`/reset-password`, `/course`, and `/finances`. There is no route-per-feature precedent.

Three options, with the tradeoffs:

**Option A — new `ViewState` inside the existing shell.** Add `"mortgage"` to
`VALID_TABS`, render a `MortgageCalculatorPanel` alongside the other panels.
Reachable at `/finances?tab=mortgage`.
*Pro:* matches every existing feature, inherits the sidebar, bottom tab bar, auth gate,
and context badge for free. *Con:* grows BudgetClient, and the spec says this tool is
independent of the rest of the app — this couples it to the finances shell.

**Option B — new route `/mortgage` with its own shell.** True standalone page.
*Pro:* honors the spec's independence claim; keeps BudgetClient from growing.
*Con:* has to re-implement the nav shell (sidebar + bottom tab bar + safe-area padding),
or ship without nav, which strands the user on a page with no way back. Nothing in the
codebase does this today.

**Option C — new route `/mortgage` that reuses an extracted shell.** Pull the nav
chrome out of BudgetClient into a shared layout, then use it from both.
*Pro:* correct long-term. *Con:* this is a refactor of a working 2,588-line component,
which CLAUDE.md's "never rewrite a working function to add a new feature" rule puts
squarely in ask-first territory. Not proposing it as part of this build.

**Recommendation: Option A.** It is the only one that ships the feature without either
duplicating or refactoring the shell. The spec's "not part of the CRM" constraint is
about *data coupling* — no deals, no properties, no pipeline — and Option A satisfies
that completely, since the calculator persists nothing and reads nothing.

**Needs your call before I start.**

### Secondary nav question

The mobile bottom tab bar has exactly five items (Overview, Manage, Transactions,
Analytics, Profile) and is full at 5 across a 375px viewport. A sixth will crowd it.

Suggested instead: add the calculator as a sixth section pill inside `ManagePanel`,
which already has a horizontally-scrolling strip:

```ts
// ManagePanel.tsx:20
type Section = "budgets" | "bills" | "goals" | "debts" | "assets";
```

The strip already scrolls, so a sixth entry costs nothing. Also needs your call.

---

## 1. Component structure

```
components/mortgage/
  MortgageCalculatorPanel.tsx   container; owns state, composes the three sections
  InputPanel.tsx                shared inputs + loan-type conditional inputs
  ResultsPanel.tsx              stat grid + payment breakdown + loan-type additions
  AffordabilityPanel.tsx        front/back-end DTI, hidden for hard money and DSCR
  AmortizationSection.tsx       expandable; annual rows -> monthly rows
  RateFillButton.tsx            "use current average" control
  types.ts                      input/result types, loan-type discriminated union
```

Matches the existing `components/budget/`, `components/debts/`, `components/goals/`
folder convention.

## 2. Where the math lives

```
lib/mortgage/
  calculate.ts       pure entry point: MortgageInputs -> MortgageResult
  amortization.ts    schedule generation, incl. interest-only + balloon
  loanTypes.ts       per-type rules: MI, fees, field visibility, DTI guidelines
  dti.ts             front-end / back-end ratios + pass/caution/fail
  types.ts
```

Precedent for pure math in `lib/` with no React dependency:

```ts
// lib/debts/debtService.ts:14
export function monthsToPayoff(balance: number, apr: number, payment: number): number | null
```

Not reusable directly (different shape — that one solves for months given a payment,
this needs a full period-by-period schedule) but it sets the pattern: exported pure
function, unit-tested under `tests/unit/`.

### Loan-type branching

A discriminated union on `loanType`, not a pile of conditionals:

```ts
type LoanConfig =
  | { kind: "conventional"; pmiRate: number }
  | { kind: "fha"; ufmipFinanced: boolean; downPct: number }
  | { kind: "va"; fundingFeeFinanced: boolean; exempt: boolean; subsequentUse: boolean }
  | { kind: "hardMoney"; termMonths: number; points: number; arv?: number }
  | { kind: "dscr"; grossRent: number; vacancyPct: number; opex: number; threshold: number };
```

Each branch returns the same `MortgageResult` shape with optional type-specific fields,
so `ResultsPanel` renders from one contract. Field visibility is derived from the same
config object so the input panel and the calculator can never disagree about which
fields apply.

Hard money is the branch that breaks the model: interest-only, so no principal
amortization, term in months, and a balloon row at the end. It gets its own schedule
generator rather than a flag threaded through the standard one.

## 3. State management

Local `useState` in `MortgageCalculatorPanel`, recomputing synchronously on change.
No Supabase, no API state, no context — the spec puts persistence out of scope, so
there is nothing to fetch or save. The existing panels take props and call `/api/*`
routes; this one has no backend except the rate fetch.

On persistence (spec asks whether it's trivial to add later): **yes, and I'd leave a
seam for it but not build it.** The inputs are one flat object; saving it later is one
table with a `jsonb` inputs column and the same `resolveContext` owner-scoping every
other table uses (`owner_type` / `owner_id`, per `lib/debts/debtService.ts:27`). No
structural work now — just keep inputs in a single serializable object rather than
scattered `useState` calls.

## 4. Reuse — existing components and tokens

| Need | Reuse |
|---|---|
| Result tiles | `components/budget/StatCard.tsx` — label / value / subtext / variant, already has `success`/`warning`/`danger` variants that map onto DTI pass/caution/fail |
| Card surface | `bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-4 shadow-[var(--shadow-sm)]` (DESIGN_AUDIT 5a) |
| Section labels | `text-[9px] uppercase tracking-widest text-(--color-text-tertiary)` (5e) |
| Loading state | `.skeleton` class from `app/globals.css:146` — only needed for the rate fetch |
| Modal, if any | centered overlay pattern (5b). Current design needs none |
| Icons | `lucide-react`, already the app-wide system icon set |
| Colors | `--color-accent` for pass, `--color-warning` caution, `--color-danger` fail |

No new design tokens. No new dependencies.

## 5. Rate fetch

**Server route, not client.** `app/api/mortgage/rate/route.ts`, following the existing
route shape (`app/api/debts/summary/route.ts`).

Reasons it must be server-side: FRED requires an API key, and putting it in a
`NEXT_PUBLIC_*` var exposes it. The existing API routes also all gate on
`supabase.auth.getUser()` first, which this should match.

- Series `MORTGAGE30US` (Freddie Mac PMMS, weekly, released Thursdays)
- Cache the response — `revalidate` of a few hours is plenty for weekly data
- Return `{ rate, observationDate, source }` so the UI can label it as the spec requires
- On any failure: return 204 and let the UI fall back to manual entry silently

**Two things I need from you:**

1. **`FRED_API_KEY` must be added to `.env.local`.** CLAUDE.md forbids me touching env
   files. Free key from https://fred.stlouisfed.org/docs/api/api_key.html. I'll write
   the route to no-op cleanly when the var is absent, so nothing breaks before you add it.

2. **The spec's rate source doesn't cover the term presets.** `MORTGAGE30US` is the
   30-year rate. The spec offers 30 / 20 / 15 year presets. Filling a 15-year loan with
   the 30-year average is just wrong — 15-year runs meaningfully below 30-year.
   FRED publishes `MORTGAGE15US` for this. Proposal: use `MORTGAGE30US` for 30 and 20
   (labeled as 30-yr average for the 20-yr case), `MORTGAGE15US` for 15. Confirm, or
   tell me to restrict the fill to 30-year only.

Per the spec: no fill control for hard money or DSCR, and the fetched value never
overwrites a value the user typed, never fires on load.

## 6. Mobile layout

Mobile-first, verified at ≤390px before desktop, per CLAUDE.md rule 11.

- Stacked single column, inputs first, then results, then the amortization section —
  matches the spec and the app's existing `lg:hidden` / `lg:` split
- CSS Grid with `alignContent: start`, no `max-width` on the page container
- Bottom padding to clear the fixed tab bar plus `env(safe-area-inset-bottom)`, the
  same treatment the nav uses at `BudgetClient.tsx:2552`
- Currency and percent inputs use `inputMode="decimal"` so phones raise the numeric pad

**Amortization table on a phone** is the hard part — six columns will not fit at 390px.
Plan: default to annual summary rows, and on mobile render each row as a two-line
stacked card (year + payment on line one, principal / interest / balance on line two)
rather than a horizontally scrolling table. Desktop gets the real table. The
mortgage-insurance-ends row gets an accent left border in both.

## 7. Test coverage

Two layers, matching the existing split (`jest.config.ts` + `playwright.config.ts`,
which sets `testIgnore: "**/unit/**"`).

**Unit — `tests/unit/mortgage.test.ts` (jest, `npm run test:unit`)**

This is where the real risk is. Cases:

- Standard amortization: known-good payment for a fixed principal/rate/term
- Zero-interest edge case (division by zero in the standard formula)
- Conventional PMI drop-off: month LTV hits 78% of *original* value
- FHA: UFMIP 1.75% financed vs. paid at closing; MIP permanent under 10% down,
  terminating at 132 months at 10%+
- VA: funding fee tiers, exempt checkbox zeroes it, financed vs. not
- Hard money: interest-only payment, balloon equals full principal, points as
  closing cost, term in months
- DSCR: NOI and annual debt service, ratio against the 1.25 default, pass/fail boundary
- Front/back-end ratios including the full PITI + MI definition from the spec
- Schedule totals reconcile: sum of principal = loan amount, sum of interest =
  reported total interest

**E2E — `tests/19-mortgage-calculator.spec.ts` (Playwright, `npx playwright test tests/19-mortgage-calculator.spec.ts`)**

Next free number; `18-category-override.spec.ts` is the current highest. Follows the
existing convention: `test.use({ storageState: ".playwright/user.json" })` plus
`stubDataEndpoints(page)` from `tests/helpers.ts`.

- Page renders, defaults populate, results appear without interaction
- Switching loan type shows/hides the right fields (PMI vs. MIP vs. neither)
- Down payment currency/percent toggle keeps the two in sync
- Amortization section expands inline, no navigation
- Rate fill button populates the field and does not clobber a typed value
- Rate endpoint stubbed to fail → field stays manual, no error surfaced
- **Mobile viewport assertion at 390px** — the spec and CLAUDE.md both require it

Per CLAUDE.md, the feature is not done until the Playwright test passes.

## 8. Conflicts with existing conventions — flagged, not resolved

1. **"Standalone page" vs. single-route architecture.** Section 0. Blocking.
2. **Bottom tab bar is full at five items.** Section 0. Blocking.
3. **The app is context-scoped, this feature isn't.** Every existing data feature
   resolves a personal-or-team context via `resolveContext` before reading anything.
   The calculator has no data, so it sits outside that model. Harmless, but it means
   the context badge in the header will be showing a context the page ignores. Worth
   knowing before someone files it as a bug.
4. **No shared form primitives exist.** There is no `Input` or `Select` component —
   every panel writes its own inputs inline with Tailwind classes. This page has ~14
   inputs. I'd write local field components inside `components/mortgage/` rather than
   introducing an app-wide primitive, which would be scope creep. Flagging because it
   is duplication, deliberately chosen.

## 9. Ambiguities in the spec

1. **"Buy or refi" does nothing.** It's in the input table but no section of the spec
   says what it changes. On a refi there's no down payment (it's equity), LTV comes off
   appraised value, and VA has a different funding fee for IRRRL. Either tell me what it
   should drive, or I'll cut the field rather than ship a control with no effect.

2. **VA funding fee needs its full tier table.** The spec gives 2.15% first-use at 0%
   down and says it reduces at higher down payments and rises on subsequent use. The
   actual VA table has specific breakpoints (5% and 10% down). Send me the numbers you
   want, or I'll implement the current published VA table and note the source in a
   comment.

3. **PMI cancellation is modeled one way only.** The spec's 78% automatic termination
   is correct. Borrower-requested cancellation at 80% LTV is a separate right and lands
   earlier. Not asking to build it — flagging that the calculator will show a later
   drop-off date than a borrower who requests cancellation would actually get.

4. **DSCR threshold "configurable."** Configurable by whom — a visible input on the
   page, or a constant? No settings surface exists for this. Assuming a visible input
   defaulting to 1.25 unless you say otherwise.

5. **Hard money term unit collides with the shared term field.** Spec has "Loan term |
   years" globally and "term in months" for hard money. The field will swap its unit
   label and preset chips when hard money is selected. Calling it out because it means
   the shared input isn't actually shared.

6. **Start date drives payoff and PMI end date, but no schedule anchor is specified.**
   Assuming first payment falls one month after the start month, standard convention.

---

## Build order

1. `lib/mortgage/` — types, standard amortization, per-type rules. Unit tests alongside.
2. Unit test suite green before any UI exists.
3. `MortgageCalculatorPanel` + `InputPanel` + `ResultsPanel`, wired to the pure functions.
4. `AffordabilityPanel`.
5. `AmortizationSection`, annual/monthly toggle, mobile stacked rows.
6. Rate route + `RateFillButton`.
7. Playwright spec, mobile viewport verified at 390px.
8. `npm run build`, then report.

Nothing here touches Plaid, `.env`, migrations, or anything outside `lib/mortgage/`,
`components/mortgage/`, `app/api/mortgage/`, the two test files, and — depending on
your answer to Section 0 — a small addition to `BudgetClient.tsx` and `ManagePanel.tsx`.

**Stopping here for approval.**
