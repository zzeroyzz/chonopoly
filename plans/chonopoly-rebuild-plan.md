# Chonopoly rebuild: one house, one flow

**Status: User approved — 2026-10-17.** Verified against the repo and revised
after Approver review (CHANGES REQUESTED, all 11 items addressed).
Phase 0 only is authorised. The migration is written but **not run**.
Replaces the earlier draft, *"Saved scenarios belong to properties."*

---

## Verification against the repo

Every path, table, column, function and route the plan names was checked. The
corrections below are already applied to the body of this plan.

### Gate: `analyses` is empty

`SELECT count(*) FROM analyses` → **0 rows.** The reshape in Phase 1 is safe to
proceed with.

Two neighbouring counts worth knowing:

| Table | Rows |
|---|---|
| `analyses` | 0 |
| `mortgage_scenarios` | **1** |
| `properties` | 0 |

That one scenario is real saved work with **no property attached and no property
rows to attach it to**. It is the entire population of the Phase 1 "Unassigned"
group, and the only live test of the copy.

### Corrections

**1. Plan location.** The prompt referenced `docs/plans/chonopoly-rebuild-plan.md`.
The file is at **`plans/chonopoly-rebuild-plan.md`**. `docs/plans/` exists but
holds the old personal-finance plans.

**2. `analyses.property_id` already exists, and is wrong in two ways.** The plan
described adding it as *"nullable, `ON DELETE SET NULL`"*. It is already there as
**`NOT NULL`, `ON DELETE CASCADE`**. Migration 2 must therefore:

```sql
ALTER TABLE analyses ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE analyses DROP CONSTRAINT <fk>, ADD CONSTRAINT <fk>
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
```

This is an ALTER of a live constraint, not a column addition. With `CASCADE` left
in place, deleting a property would silently destroy its analyses — the exact
outcome `SET NULL` was chosen to prevent.

**3. `analyses` already has `label`, `owner_type` and `owner_id`.** Migration 2
adds only `kind`, `is_primary`, `inputs`, `outputs`, `profile_snapshot`.

**4. Soft delete: `archived_at`, not `deleted_at`.** `analyses` already carries
`archived_at`. The plan said `deleted_at`, which would leave the table with two
soft-delete columns and no rule about which wins. **Reuse `archived_at`.** Note
this differs from `mortgage_scenarios`, which uses `deleted_at` — the service
layer has to map between them during the copy.

**5. `/cash-flow` and `/markets` do not exist as routes.** They are "soon" cards
on the hub that 404 when tapped. There is nothing to redirect *from*; removing
the hub removes the only links to them. The redirect list is corrected to
`/app`, `/crm` → `/pipeline` · `/mortgage` → `/tools/mortgage` · `/profile` →
`/settings/account`.

**6. `lib/rentcast/client.ts` does not exist** — correct, it is Phase 2 work.

### Confirmed present

All reused functions exist where the plan says: `calculateMortgage`,
`calculateDti`, `calculateAffordability`, `calculateRequiredIncome`,
`upsertProperty`. All refactor targets exist: `InputPanel.tsx`,
`ScenarioBar.tsx`, `scenarioService.ts`, `PropertyDetailPage.tsx`,
`storage.ts`.

### CRM pipeline stages

From `lib/crm/stages.ts`, which is the source of truth:

| Value | Label |
|---|---|
| `new_lead` | New lead |
| `contacted` | Contacted |
| `qualified` | Qualified |
| `offer` | Offer |
| `under_contract` | Under contract |
| `closed` | Closed *(terminal)* |
| `dead` | Dead *(terminal)* |

"Adding a house puts it in the CRM pipeline at the first stage" means
**`new_lead`**. Terminal stages are filtered out of the pipeline list by default,
and backwards moves are allowed — nothing gates them.

---

## Goal

Chonopoly does one job: **find a house, run the numbers, work the deal.**

Right now the app is organized by tool: a hub with four cards, each holding its own data. That's why a house you modelled and the same house in the CRM can't see each other. The rebuild organizes everything around the house, and makes the way you actually evaluate houses the main path through the app.

## Stack

TypeScript, Tailwind, Next.js, Supabase, Vercel. One new external service: RentCast, for comps and property facts. No other new dependencies.

---

## Decided

- Flips come first. Rental is a rough estimate only.
- The calculator can create properties, since screening an agent's houses requires it.
- The CRM that already exists (stages, tasks, notes, contacts) stays as it is. Each house tracks the flow with a progress checklist, so no new stages are added.
- Adding a house puts it in the CRM pipeline at the first stage. Screening results appear as verdicts on the house, and a stage only changes when you change it.
- Visiting is optional. A rehab estimate can come from the listing photos or from a walkthrough. You can also skip estimating and keep the reno budget you set.
- Comps come from RentCast, and your agent's MLS comps can be entered by hand alongside them.
- Income and debts are entered once in Settings and used for every ratio until you change them.

## Six rules the rebuild follows

1. **The property is the spine.** Every analysis, note, task, comp and contact belongs to a house.
2. **You enter yourself once.** Income, debts, cash and loan defaults live in Settings, and every ratio reads them.
3. **Every number has one home.** Each house has one *primary* financing scenario. The rehab check, flip analysis and compare view all read its price and reno budget. Any other scenarios are what-ifs. ARV is stored once per house, in `valuations`.
4. **The flow is a checklist, not a gate.** You can skip steps or do them in any order. Each house shows which steps are finished and suggests what to do next.
5. **Quick math stays quick.** Calculators work without a house attached. The save step is where you choose the house.
6. **The math carries over.** `calculateMortgage`, `calculateDti`, `calculateAffordability` and `calculateRequiredIncome` are reused unchanged. New calculations sit beside them as pure, tested functions.

---

## The flow

```
  Agent sends houses
        │
  1. ADD        paste addresses             → property + facts + comps (RentCast)
  2. SCREEN     can we afford it?            → financing on your profile + ARV check
  3. ESTIMATE   what does it need?           → rehab estimate from listing photos
     (VISIT)    optional walkthrough         → refines the estimate
  4. CHECK      estimate vs. reno budget     → over / under, re-screen if over
  5. COMPARE    finalists side by side       → profit, cash, payment
  6. OFFER
```

**Shortest path:** Add → Screen → Compare, using the reno budget you set during the screen.

| Step | You do | The app does | Optional? |
|---|---|---|---|
| 1 Add | Paste one or more addresses, each with an optional price and listing link | Matches or creates each property (`upsertProperty`, `origin: "analysis"`) and pulls facts and comps from RentCast | No |
| 2 Screen | Look over the table and check off the renovated comps | Runs financing on your profile, calculates ARV, checks the 203(k) cap and the 70% rule, and shows the verdicts | No. Every house gets screened |
| 3 Estimate | Go through the listing photos one system at a time | Adds up costs and applies contingency | Yes. If you skip it, your reno budget stays in place |
| Visit | Schedule it, walk the house, take notes | Creates a visit task in the CRM, saves notes as activity, and updates the estimate | Yes |
| 4 Check | Nothing to do; it happens automatically | Compares the estimate with the reno budget and, if the estimate is higher, offers to re-screen with the new number | Runs whenever there's an estimate |
| 5 Compare | Pick finalists and open compare | Lays them out side by side in columns | Yes |
| 6 Offer | Enter your offer | Shows the max offer next to your number | — |

Each house has a progress checklist: **Numbers · Comps · Estimate · Visit**. CRM stages, tasks and notes keep working the way they do now, and nothing in this flow changes a stage automatically. Whenever a step records something, such as a visit or an estimate, it also appears in that house's CRM activity.

### Step 1: Add

- One screen, `/properties/new`, with a text box that takes one address per line plus an optional price and listing link: `128 Maple St, Duluth GA 30096, 250000, https://…`.
- The listing link is saved on the property, so the photos are one tap away when you're estimating.
- Each line is parsed and sent through `upsertProperty`. Matches show the existing message (*"Matches 128 Maple St, already in your pipeline at Contacted"*). Probable matches set `needs_address_review`, and that flag is shown here.
- Each new property gets one RentCast AVM call, and the facts (beds, baths, sqft, year built) and comps are saved. If one house fails, the rest of the batch still goes through.

### Step 2: Screen

The screen is one table with one row per house:

| Address | Price | PITI | Back DTI | Cash to close | ARV | Max offer (70%) | Verdicts |
|---|---|---|---|---|---|---|---|

There are two verdicts, because they answer different questions:

- **Can we afford it?** Ratios within limits, cash to close within your available cash, and the loan within the 203(k) cap. → *Qualifies · Tight · Doesn't qualify (reason)*
- **Does the deal work?** Price compared with max offer, plus projected profit and margin. → *Works · Thin · Doesn't work*

ARV begins as **provisional**: it's calculated from every comp RentCast returned and labeled "unreviewed" until you check off the renovated ones on the Comps tab. Any verdict that depends on it carries the same label.

Inputs per house are price, annual taxes (from RentCast when available), insurance, HOA and reno budget. Everything else comes from your profile and defaults.

### Steps 3–4: Estimate (optional visit), Check

- **Estimate:** the Rehab tab is a checklist organized by system: roof, HVAC, plumbing, electrical, kitchen, baths, flooring, paint, exterior, other. Each system gets a condition (good / repair / replace) and a cost. Systems marked repair or replace get a cost, and good ones stay at $0. The listing link appears at the top of the tab. Every estimate records where it came from (*photos* or *visit*), and each source has its own contingency % from your cost defaults. *(Level of detail is open question 2.)*
- **Visit (optional):** schedule it from the house, which creates a CRM task. Your notes go into the same checklist, the estimate updates, and it's marked *from visit*. A photo estimate gets refined in place instead of starting over.
- **Skipping the estimate:** the reno budget you set during the screen is used everywhere. The rehab row reads *Budget only*.
- **Check:** appears anywhere the rehab number appears: *Budget $45k · Estimate $52k · $7k over.* If the estimate is over, one button ("Re-screen at $52k") creates a new version of the primary financing scenario and re-runs the 203(k) cap.

### Step 5: Compare

`/compare` puts 2–4 houses in columns. The rows are grouped:

- **Afford:** PITI, back DTI, cash to close
- **Rehab:** budget, estimate and its source (or *Budget only*), gap
- **Deal:** ARV, all-in cost, profit, margin, max offer vs. price

---

## Your profile (Settings)

You enter it once, every calculation reads it, and it changes only when you edit it in Settings.

**`/settings/profile`**

| Section | Fields |
|---|---|
| Income | One row per source: label, type (W-2, hourly, 1099/self-employed, other), gross monthly qualifying amount, borrower |
| Debts | One row per debt: label, type, monthly payment, *include in ratios* toggle |
| Cash | Amount available for down payment and closing, plus reserves to keep |
| Ratio limits | The limits `calculateDti` applies today, displayed so you can see what "pass" means |

**`/settings/defaults`**

| Section | Fields |
|---|---|
| Loan | Program (FHA 203(k), conventional, HomeStyle, …), rate, term, down payment %, DPA (name, amount or %, grant or second lien with its payment), closing costs %, FHA county loan limit |
| Flip costs | Buying %, selling %, holding cost per month, holding months, contingency % (one for photo estimates and one for visit estimates) |

The *include in ratios* toggle handles lender exclusions, such as a debt with only a few payments left or a co-signed loan someone else pays, without building lender rules into the app.

### How the profile reaches the math

`MortgageInputs` (36 fields) is split across three sources:

```
profile    income, debts, cash                   ← Settings, per context
defaults   program, rate, term, down %, DPA,     ← Settings, overridable per scenario
           closing %, county limit
house      price, taxes, insurance, HOA,          ← the property / its scenario
           reno budget, ARV
```

`resolveInputs` combines the three into a complete `MortgageInputs`, so the calculation functions stay as they are.

### The field map (Phase 0, task 1 — done)

All **36** fields of the current `MortgageInputs`, each assigned one source.

**profile** — facts about the borrower. 4 fields.

| Field | Source |
|---|---|
| `grossMonthlyIncome` | sum of `profile_incomes.gross_monthly` |
| `otherMonthlyDebt` | sum of `profile_debts.monthly_payment` where `include_in_ratios` |
| `vaExempt` | borrower attribute, not a loan preference |
| `vaSubsequentUse` | borrower history — whether they have used VA entitlement before |

**defaults** — loan and cost preferences, overridable per scenario. 19 fields.

| Field | Settings section |
|---|---|
| `loanType`, `renovationProgram` | Loan → program |
| `interestRate`, `termYears`, `termMonths` | Loan |
| `pmiRate`, `pmiRateAuto` | Loan |
| `closingCostPercent` | Loan |
| `insuranceRateAuto` | Loan |
| `fhaUfmipFinanced`, `vaFundingFeeFinanced` | Loan |
| `points` | Loan |
| `dpaEnabled`, `dpaStructure`, `dpaRate`, `dpaTermYears` | Loan → DPA |
| `renovationContingencyPct` | Flip costs → contingency |
| `vacancyPct` | Flip costs |
| `dscrThreshold` | Loan |

**house** — facts about this property or this scenario. 10 fields.

| Field | Source |
|---|---|
| `homeValue` | the price on the property or scenario |
| `loanAmountOverride` | scenario-level override; null unless typed |
| `propertyTaxYearly` | property, from RentCast where available |
| `insuranceYearly` | property; derived from value while `insuranceRateAuto` |
| `hoaMonthly` | property |
| `renovationBudget` | property's primary financing scenario |
| `afterRepairValue` | `valuations`, kind `arv` |
| `arv` | `valuations`, kind `arv` — **see duplication below** |
| `grossMonthlyRent` | property (rental estimate) |
| `operatingExpensesMonthly` | property (rental estimate) |

**computed** — never stored; derived at resolve time. 3 fields.

| Field | How |
|---|---|
| `downPayment` | `defaults.downPaymentPct` × total acquisition cost. Stored in dollars by the type, so `resolveInputs` does the multiply |
| `startMonth`, `startYear` | today, unless a scenario pins them |

### Two things the map exposes

**`afterRepairValue` and `arv` are the same number in two fields.**
`afterRepairValue` is read by the renovation path, `arv` by hard money — and
nothing keeps them equal today. The plan says ARV is stored once per house in
`valuations`, so `resolveInputs` must populate **both** from that single row.
Leaving them independent would let one screen say the house is worth $310k and
another say $280k, with no indication which is right.

**`downPayment` is dollars, but `defaults` holds a percent.** The type has no
percent field — `downPaymentPercent()` derives it. So the percent lives only in
`defaults`, and `resolveInputs` owns the conversion. Worth stating because the
calculator's own percent box recently had a bug from exactly this kind of split
basis, fixed in `a4828b3`.

### When you change the profile

- Every saved analysis keeps a snapshot of the profile and defaults it was run with.
- If your current profile is different, the analysis shows **"Your numbers changed since this ran"** with a **Re-run** button, and re-running saves a new version.
- Nothing re-runs on its own, so old verdicts can always be traced back to the numbers behind them.
- The quick calculator's localStorage draft (`storage.ts`) no longer stores profile fields. It reads them live instead.

---

## Navigation

The four-card hub is removed. The mobile bottom nav and desktop sidebar become:

```
Pipeline   Properties   + Add   Tools   Settings
```

| Route | What it is |
|---|---|
| `/pipeline` | Board or list grouped by stage. This is home. |
| `/properties` | Every house, filterable, including Passed |
| `/properties/new` | Batch add |
| `/properties/[id]` | Property page |
| `/compare?ids=` | Side-by-side comparison |
| `/tools/mortgage`, `/tools/flip`, `/tools/rental` | Calculators that work without a house, with "Save to a house" |
| `/settings/profile`, `/settings/defaults`, `/settings/team`, `/settings/integrations`, `/settings/account` | Settings |

These stay: `/login`, `/setup`, `/invite`.
Redirects: `/app`, `/crm` → `/pipeline` · `/mortgage` → `/tools/mortgage` · `/profile` → `/settings/account`.
`/cash-flow` and `/markets` need no redirect — they are hub cards that 404 today, and removing the hub removes the only links to them.

### Property page

```
128 Maple St, Duluth GA               ● Contacted      ← existing CRM stage
[ Qualifies ]  [ Profit $31k · 12% ]  [ Rehab $52k / $45k ]
Numbers ✓   Comps ✓   Estimate ✓ photos   Visit —

[        Suggested: Add to compare        ]

Overview   Numbers   Comps   Rehab   Activity
```

- **Overview:** key numbers, contacts, listing link, suggested step.
- **Numbers:** financing scenarios (primary plus what-ifs), flip analysis, rental estimate, and versions with restore.
- **Comps:** comp list with include checkboxes, ARV, source and fetch date, a refresh button, and a way to add an agent comp by hand.
- **Rehab:** the estimate by system, where it came from, and visit notes if there was a visit.
- **Activity:** the existing CRM tasks, notes and stage history.

The suggested step is the first unchecked item on the checklist. Every step can also be opened straight from its tab, in any order.

---

## RentCast integration

- **Key:** `RENTCAST_API_KEY`, set in `.env.local` and in Vercel's environment variables. It's server-only: no `NEXT_PUBLIC_` prefix, and it's never sent to the browser.
- **Client:** `lib/rentcast/client.ts`, using base URL `https://api.rentcast.io/v1` and the `X-Api-Key` header.
- **Call:** `GET /avm/value`. **Confirmed against the docs, 2026-10-18:**

  | Parameter | Type | Range / default |
  |---|---|---|
  | `address` | string | `"Street, City, State, Zip"` — or `latitude`/`longitude` instead |
  | `compCount` | integer | **5–25, default 15** |
  | `maxRadius` | float | miles |
  | `daysOld` | integer | minimum 1 |
  | `lookupSubjectAttributes` | boolean | **default true** — not in the earlier draft |
  | `propertyType`, `bedrooms`, `bathrooms`, `squareFootage` | — | optional hints that improve comp matching |

  All three names the plan guessed are correct.

- **One call, not two.** The response carries a **`subjectProperty`** object with
  `bedrooms`, `bathrooms`, `squareFootage`, `propertyType`, `yearBuilt`,
  `lotSize`, `lastSaleDate` and `lastSalePrice`. The planned fallback to
  `GET /properties` is **not needed**, which halves the request cost per house —
  it matters on a 50-request month.

- **Response shape:** `price`, `priceRangeLow`, `priceRangeHigh`,
  `subjectProperty`, `comparables`. Each comparable carries `id`,
  `formattedAddress`, `price`, `propertyType`, `bedrooms`, `bathrooms`,
  `squareFootage`, `yearBuilt`, `lotSize`, `status`, `listingType`,
  `listedDate`, `removedDate`, `lastSeenDate`, `daysOnMarket`, `distance`,
  `daysOld` and `correlation`, sorted by correlation.

- **A caveat the plan did not anticipate.** `status` is **`"Active"` or
  `"Inactive"`** — not sold or listed. An inactive comp was *removed*, which
  might mean it sold or might mean the seller gave up. RentCast does not say
  which. So the Comps tab labels them **Active / Removed** rather than claiming
  a sale, and the ARV note says plainly that a removed listing is not a
  confirmed sale. Calling an unsold withdrawal a comp is how an ARV ends up
  too high.

- **Quota:** the free Developer plan is **50 requests a month**, confirmed.

**Spend guard (added 2026-10-18, after the first live lookup).** One request
per house per 30 days, enforced by four gates in order: the monthly cap, a
30-day cache keyed on the normalized address, a database in-flight lock, then
the call. The response body is stored before anything parses it, so a crash
downstream is recoverable without a new request.

| Setting | Value | Why |
|---|---|---|
| Monthly cap | **45** of 50 | Our count can only estimate RentCast's, so stop before the real ceiling rather than discover it by being cut off |
| Reuse window | **30 days** | A house's comps do not move faster than that |
| `RENTCAST_MODE` | `live` / `mock` | Unset means mock everywhere except Vercel production, so a preview deploy cannot spend the allowance |
| Force refresh | `org_owner` only | A shared allowance; spending it early is the owner's call |

**What counts as billable: the request left the process.** 2xx, 4xx, 5xx and a
network error all count; only a local refusal (no key, cap, cache hit, held
lock, mock mode) does not. The first version treated 401/403 as free, and
RentCast's dashboard read 3 against our 1 as a result. Undercounting is the
dangerous direction — it reads as headroom that is not there.
- **Route:** `POST /api/properties/[id]/comps` fetches and stores comps; `GET` returns the stored ones.
- **Cache:** comps are saved with `fetched_at`. A house isn't fetched again within 30 days unless you press Refresh, which tells you it uses one request.
- **Usage:** every call is logged to `rentcast_requests`. Settings → Integrations shows this month's count against your plan's limit (the free plan allows 50 a month) and warns you at 80%.
- **Never blocking:** if there's no key, the quota is used up, or no comps come back, the Comps tab explains what happened and offers manual entry. The rest of the flow keeps working.
- **Tests:** RentCast is mocked with fixture JSON, and CI never makes live calls.

### ARV

- `calculateArv(includedComps, subjectSqft)` takes the average price per square foot of the included comps and multiplies it by the subject's square footage. It's a pure function with unit tests.
- RentCast's own estimate is a current-condition (as-is) value built from nearby listings. It's stored as `as_is` and never used as the ARV.
- Each comp shows its status (sold or listed) and date. Only comps you check are counted.
- You can override the ARV by hand and add a note explaining why. The ARV is saved to `valuations` along with the IDs of the comps it used.

---

## New calculations

All of these are pure functions that sit alongside the existing ones, and each has unit tests.

| Function | Returns |
|---|---|
| `calculateArv` | ARV, $/sqft, comp count |
| `calculateFlip` | All-in cost, profit, margin %, ROI, max offer (70% rule) |
| `calculate203kCap` | Maximum loan, whether purchase + rehab fits under it, and the out-of-pocket gap |
| `calculateRehab` | Subtotal per system, contingency, total |
| `resolveInputs` | A complete `MortgageInputs` built from profile + defaults + house |

**`calculateFlip`**: profit = ARV − purchase − rehab − buying − holding − financing − selling.
Test fixture (FlipperForce's worked example): purchase $95,000, ARV $210,000, repairs $65,000, buying 1%, holding $750 × 5 months, financing 12% on $140,000 for 6 months, selling 8% → profit **$20,100**.

FlipperForce publishes $20,900 for this example, but that figure does not
follow from the inputs it states. The page says "8% in Selling Costs" and then
shows $16,000 — which is 7.619% of the $210,000 resale value, i.e. 8% of
$200,000. Eight percent of the actual resale value is $16,800, which gives
$20,100. The fixture uses the stated 8%, so every input is the one the example
names and every output follows from it.

**`calculate203kCap`**: the lower of (adjusted as-is value + rehab + financeable items) or 110% of the after-improved value, multiplied by the LTV factor (96.5% on a purchase), and kept within the county loan limit. It's labeled as an estimate everywhere it appears, because the lender's worksheet is the final word. The Limited 203(k) rehab ceiling comes from whatever HUD guidance is current at build time.

---

## Data model

```
buyer_profiles ──< profile_incomes
   (per context) ──< profile_debts

properties ──┬──< pipeline_entries ──< tasks / activities / property_stage_history
             ├──< property_contacts >── contacts
             ├──< property_comps
             ├──< valuations            kind: as_is | arv
             └──< analyses ──< analysis_versions
                   kind: financing | rehab | flip | rental
```

### Migrations

Each phase's migrations are written and reviewed but **not run until approved**.

1. `buyer_profiles`, `profile_incomes`, `profile_debts`, plus `mortgage_scenarios.profile_snapshot`. Context-shaped columns, **personal-only RLS**, children delegating to the parent. Specified in full in the Phase 0 section. *(Phase 0)*
2. `analyses` is reshaped. `property_id`, `label`, `owner_type` and `owner_id` already exist; `property_id` must be ALTERed from `NOT NULL`/`CASCADE` to nullable/`SET NULL`. Columns added: `kind`, `is_primary`, `inputs jsonb`, `outputs jsonb`, `profile_snapshot jsonb`. Soft delete reuses the existing `archived_at` rather than adding `deleted_at`. `analysis_versions` and the snapshot trigger are ported over from `mortgage_scenario_versions`. Unique on `(context, property_id, kind, label)`, and a property can have at most one primary financing analysis. *(Phase 1)*
3. `mortgage_scenarios` is copied into `analyses` (`kind: financing`, `property_id: null`, with versions). The old table stays, read-only. *(Phase 1)*
4. Property fact columns (beds, baths, sqft, year built, annual taxes, listing URL), adding only the ones that don't already exist. *(Phase 2)*
5. `property_comps`, `valuations`, `rentcast_requests`. *(Phase 2)*
6. Drop `mortgage_scenarios` and `mortgage_scenario_versions`, **only once the copy is verified and the drop is explicitly approved**. *(Phase 5)*

The existing `analyses` table isn't in use — **confirmed 0 rows on 2026-10-17**. `mortgage_scenarios` holds 1 row and `properties` holds 0, so the Phase 1 copy has exactly one record to carry and nowhere yet to attach it.

---

## Phases

Each phase gets its own branch and PR, can ship by itself, and leaves the app in working order.

**Phase 0: Your profile** — specified in full below.

**Phase 1: The property spine**
- Reshape `analyses`, copy the scenarios over, keep versions working.
- Saving asks for the house (address → `upsertProperty`). Older saves appear in an "Unassigned" group with an option to attach an address.
- Property page with five tabs. Numbers is live, and the other tabs show the CRM content that already exists.
- New navigation and redirects, and the hub is removed.

**Phase 2: Add and Screen**
- RentCast client, comps, valuations, usage log, Integrations settings.
- Batch add (with listing links), the screen table, both verdicts, `calculateArv`, `calculate203kCap`,e and `calculateFlip` (needed for the deal verdict).
- The progress checklist on each house.

**Phase 3: Estimate, Visit, Check**
- Per-system rehab estimate from photos, `calculateRehab`, and source-based contingency.
- Optional visit: a CRM task, with notes that refine the estimate in place.
- The budget check wherever the rehab number shows up, plus the re-screen action.

**Phase 4: Compare and Offer**
- `/compare`, marking finalists, and offer entry showing the max offer.
- The complete Flip analysis tab.

**Phase 5: Rental estimate and cleanup**
- A rough rental estimate in `/tools/rental` using RentCast's rent AVM, which costs one request per house.
- Remove dead routes and components, and drop the old scenario tables once approved.
- Drop the legacy cash-flow columns from `analyses` once the rental estimate is settled. They were kept through Phase 1 because they are all defaulted and cost nothing to carry; the rental work is what decides whether any of them are still wanted.

---

## Unchanged

- The existing calculation functions.
- `upsertProperty` and how it dedupes.
- The CRM: its pipeline stages and how they move, plus tasks, activities and contacts.
- Auth, `/login`, `/setup`, `/invite`, and team contexts.

## Out of scope

- A Markets dashboard (RentCast has market stats, so this can come later).
- PropStream import.
- Note investing.
- Uploading your own photos *(open question 3)*.
- Hard money as a built-in financing program. The flip analysis accepts a generic rate, points and months, so hard money can be modelled by hand.
- Tax treatment of a sale.

---

## Risks

- **AVM comps can be misleading.** They're drawn from nearby listings and include houses that haven't been renovated. The provisional label and the check-off step address this, and ARV is never taken directly from the AVM.
- **API usage beyond the free tier costs money.** Caching, the usage log and the 80% warning keep this visible.
- **Income and debt stored in the database.** This is sensitive data. It's protected by RLS per context, never logged, and never sent to RentCast.
- **Changing your profile vs. old verdicts.** Snapshots and the "numbers changed" badge handle this, and nothing re-runs silently.
- **The 203(k) cap is an estimate.** It's labeled that way everywhere.
- **A typo in an address creates a property.** The match message appears before saving, and `needs_address_review` is shown.
- **Copying the scenarios.** The old tables stay until the copy has been verified and the drop approved.
- **Photo estimates can't see inside walls.** Roof, foundation, plumbing and electrical problems may not appear in listing photos. Every estimate shows its source, and photo estimates have their own contingency %.
- **Size.** Six phases, and each ships on its own.

## Testing

For every phase:
- **Unit:** every new calculation, including the $20,100 flip fixture. `resolveInputs` must produce the same `MortgageInputs` the current form does when given the same values.
- **API:** 400 on a missing address, 403 on the wrong context, 404 on a missing property. RentCast failure paths: no key, 429, and no comps returned.
- **Playwright at 390px:**
  - Phase 0: set income and debts once, see the calculator use them without re-entry, change a debt and see the badge. Plus the empty-profile state and a negative badge case. (The earlier wording said "screen two houses" — the screen table is Phase 2.)
  - Phase 2: paste five addresses, get five rows, check off comps, and watch ARV and the verdicts update.
  - Phase 3: estimate a house from photos without visiting, see the budget check, then add a visit and see the estimate change to *from visit*.
  - Later phases carry the same path through to compare and offer.
- `npm run build`, `tsc`, `lint`, `jest`.

## Workflow

- One branch per phase, with commits and a PR that has a description. Someone else on the project approves the PR.
- No push or merge without authorization, no migration run without approval, and nothing destructive without approval.
- Refactor the existing files where each concern already lives (`InputPanel`, `ScenarioBar`, `scenarioService`, `PropertyDetailPage`). Create new files only for new concerns.
- File paths in this plan come from the earlier draft and this conversation. Claude Code checks them against the repo before the Approver signs off.

---

## Phase 0 in full

Revised after Approver review, 2026-10-17. Owner decisions: profile is
**personal-only** (teams can include agents and assistants, so income must not be
team-readable); the snapshot column lands on `mortgage_scenarios` now; the
Playwright test covers what Phase 0 actually ships.

### Scope

**New files**, each with its reason:

| File | Why a new file is needed |
|---|---|
| `supabase/migrations/<ts>_buyer_profiles.sql` | New tables |
| `lib/profile/buyerProfileService.ts` | New concern. `lib/property/` and `lib/crm/` are the precedent for a service per domain |
| `lib/mortgage/resolveInputs.ts` | New concern — merging three sources. Kept out of `calculate.ts` so the pure maths stays free of I/O-shaped types |
| `app/api/profile/buyer/route.ts` | GET/PUT the profile |
| `app/api/profile/buyer/incomes/route.ts`, `.../debts/route.ts` | Row CRUD |
| `app/settings/profile/page.tsx`, `app/settings/defaults/page.tsx` | New routes |
| `components/settings/ProfileForm.tsx`, `DefaultsForm.tsx` | New screens |
| `components/settings/FirstRunIncomeModal.tsx` | The first-run "Set income" modal. Separate from `ProfileForm` because it collects the minimum to produce a verdict — income and debts — not the full profile |
| `tests/21-buyer-profile.spec.ts`, `tests/unit/resolveInputs.test.ts` | New coverage |

**Refactored in place — no parallel versions:**

| File | Change |
|---|---|
| `lib/mortgage/defaults.ts` | `defaultInputs()` drops `grossMonthlyIncome` and `otherMonthlyDebt`. **Tier 2: exported signature change** |
| `lib/mortgage/storage.ts` | `loadInputs()` stops returning profile fields. **Tier 2: exported signature change.** Existing drafts migrated like `migrateDpaAmount` already does |
| `lib/mortgage/scenarioService.ts` | Save writes `profile_snapshot`; `diffInputs` reused for the badge, not reimplemented |
| `components/mortgage/MortgageCalculator.tsx` | Reads the profile, calls `resolveInputs` |
| `components/mortgage/InputPanel.tsx` | Income and debt fields replaced by a line reading from the profile, with a link to Settings |
| `components/mortgage/ScenarioBar.tsx` | Badge; the income/debt entries in its `FIELD_LABELS` map (lines 35–36) are removed, since those fields leave `inputs` |
| `app/more/page.tsx` | **Temporary entry point** to Settings. Navigation is Phase 1, so without this the screens are unreachable on a phone |

### Migration 1, specified

```sql
CREATE TABLE buyer_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type  text NOT NULL CHECK (owner_type IN ('personal','team')),
  owner_id    uuid NOT NULL,

  -- Cash (Settings → profile)
  cash_available numeric NOT NULL DEFAULT 0 CHECK (cash_available >= 0),
  cash_reserves  numeric NOT NULL DEFAULT 0 CHECK (cash_reserves  >= 0),

  -- Loan defaults (Settings → defaults)
  loan_type            text    NOT NULL DEFAULT 'fha',
  renovation_program   text    NOT NULL DEFAULT 'none',
  interest_rate        numeric NOT NULL DEFAULT 6.75 CHECK (interest_rate >= 0),
  term_years           integer NOT NULL DEFAULT 30   CHECK (term_years > 0),
  down_payment_pct     numeric NOT NULL DEFAULT 3.5  CHECK (down_payment_pct BETWEEN 0 AND 100),
  closing_cost_pct     numeric NOT NULL DEFAULT 5    CHECK (closing_cost_pct BETWEEN 0 AND 100),
  county_loan_limit    numeric CHECK (county_loan_limit IS NULL OR county_loan_limit > 0),
  dpa_enabled          boolean NOT NULL DEFAULT false,
  dpa_structure        text    NOT NULL DEFAULT 'grant',
  dpa_rate             numeric NOT NULL DEFAULT 0,
  dpa_term_years       integer NOT NULL DEFAULT 10,

  -- Flip cost defaults
  buying_pct              numeric NOT NULL DEFAULT 1,
  selling_pct             numeric NOT NULL DEFAULT 8,
  holding_monthly         numeric NOT NULL DEFAULT 750,
  holding_months          integer NOT NULL DEFAULT 5,
  contingency_photos_pct  numeric NOT NULL DEFAULT 20,
  contingency_visit_pct   numeric NOT NULL DEFAULT 10,

  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX buyer_profiles_owner_key ON buyer_profiles (owner_type, owner_id);

CREATE TABLE profile_incomes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
  label      text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  income_type text NOT NULL CHECK (income_type IN ('w2','hourly','self_employed','other')),
  gross_monthly numeric NOT NULL CHECK (gross_monthly >= 0),
  borrower   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profile_debts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,
  label      text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  debt_type  text NOT NULL,
  monthly_payment numeric NOT NULL CHECK (monthly_payment >= 0),
  include_in_ratios boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Plus, for the badge:

```sql
ALTER TABLE mortgage_scenarios ADD COLUMN profile_snapshot jsonb;
```

**RLS — personal only, deliberately.** Children delegate to the parent, the
pattern `mortgage_scenario_versions` already uses, so the two cannot drift:

```sql
CREATE POLICY "buyer_profiles: owner only"
  ON buyer_profiles FOR ALL
  USING      (owner_type = 'personal' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'personal' AND owner_id = auth.uid());

-- No team policy. Teams can include agents and assistants, so income is not
-- team-readable. The owner_type/owner_id columns exist so a team policy can be
-- added later without a migration over a table full of income.

CREATE POLICY "profile_incomes: readable with its profile"
  ON profile_incomes FOR ALL
  USING (EXISTS (SELECT 1 FROM buyer_profiles p WHERE p.id = profile_id));
-- same for profile_debts
```

**Down path:** `DROP TABLE profile_debts, profile_incomes, buyer_profiles;` and
`ALTER TABLE mortgage_scenarios DROP COLUMN profile_snapshot;`. The owner runs it.

### Decisions the Approver asked for

- **`include_in_ratios` defaults to `true`.** A debt counts unless you say otherwise; the safe direction is the one that lowers what you qualify for.
- **`borrower` is display-only in Phase 0.** `calculateDti` sums one `grossMonthlyIncome`, so filtering by borrower would change ratios in a way nothing surfaces. The field is captured for Phase 2+ and labelled as not affecting the maths.
- **Contingency in Phase 0 uses `contingency_photos_pct`.** Source-based selection arrives with estimates in Phase 3.
- **`renovationBudget`, `afterRepairValue` and `arv` keep coming from the scenario's own `inputs` blob** in Phase 0. `is_primary` is Phase 1 and `valuations` is Phase 2, so `resolveInputs` reads them from the house only once those exist.
- **Empty profile is its own state, and it is escapable.** Not `applicable: false`,
  and not the current hardcoded 9000/600. `defaultInputs()` stops supplying a
  fabricated income entirely.

  With no profile, the calculator's ratio rows render as `—` beside a **Set
  income** button. That button opens a modal, and saving it **creates the buyer
  profile** — so a first-time user never has to leave the calculator, find
  Settings, and come back to get a verdict.

  **Debts are itemised, never a lump sum.** The modal collects named rows — "Car
  loan, $420", "Student loan, $180" — exactly as the Settings form does, because
  a single "monthly debts" total is unauditable: you cannot tell later which
  debts it included, and `include_in_ratios` has nothing to attach to. Income is
  itemised the same way for the same reason.

  `otherMonthlyDebt` in `MortgageInputs` is therefore **always a derived sum**,
  computed by `resolveInputs` from the rows where `include_in_ratios` is true. It
  is never entered directly anywhere in the app.

  **The modal is first-run only.** Once a profile exists the button is gone: the
  calculator shows the figures read-only with a link to Settings, and every later
  edit happens there. That keeps rule 2 intact — one home for the number, one
  place to change it — while removing the dead end where the app asks for
  something it gives you no way to provide.

  Deliberately *not* an inline editor and *not* a per-scenario override. An
  override would put the same number in two places and make a verdict depend on
  which one you happened to be reading, which is the split this rebuild exists to
  remove.
- **The snapshot stores the profile and defaults keys only** — never the whole resolved blob. `startMonth`/`startYear` are computed as "today", so snapshotting everything would make every saved scenario claim your numbers changed after the first of the month. The badge compares via `diffInputs` scoped to those keys.

### Refactor notes — why these are not duplicates

- **`profile_debts` vs. the existing `debts` table.** `20260531000000_debts.sql` tracks debts you are *paying off* — balance, rate, payoff goals. `profile_debts` tracks debts a *lender counts against you*, which is a different set: it includes a co-signed loan you do not pay and excludes one with three payments left. Same shape, different question. A future phase can offer "import from my debts", but merging them would force one table to answer both and get both wrong.
- **`/settings/defaults` vs. `defaultInputs()`.** `defaultInputs()` becomes the **seed** for a new profile and nothing else. Once a profile exists, `resolveInputs` reads the stored defaults. One source at any moment.
- **`resolveInputs` vs. `readInputs`.** They compose rather than overlap: `readInputs` turns a *stored blob* back into `MortgageInputs` (and migrates old shapes); `resolveInputs` merges *three live sources*. Loading a saved scenario runs `readInputs`, then overlays the current profile only to compute the badge.

### Sensitive data

Expanded from one line, because the Approver was right that it was the weakest paragraph.

- **RLS** — personal only, as above.
- **The snapshot is the side door.** `profile_snapshot` sits on `mortgage_scenarios`, which grants teams `FOR ALL`. Personal-only profiles with team-readable snapshots is inconsistent, so **income and debt are redacted from the snapshot on team-owned rows** — the snapshot stores the derived totals' *hash* and the defaults, enough to detect change, not enough to read a salary.
- **Version history is append-only and has no DELETE policy.** Income reaching `mortgage_scenario_versions` cannot be deleted later. The redaction above is what keeps it out.
- **"Never logged" needs a mechanism**: income and debt are excluded from API error payloads, and the services throw messages that name the field, never the value.

### Testing

Rewritten — the original tested the Phase 2 screen.

`tests/21-buyer-profile.spec.ts`, at 390px via `test.use({ viewport: ... })`:

1. Set income and debts once in `/settings/profile`; they persist across reload.
2. Open the calculator: DTI reflects the profile **without re-entering anything**.
3. Save a scenario, change a debt, reload → **"your numbers changed"** badge.
4. **Negative case:** no badge when nothing changed, including with the clock moved across a month boundary — the test that catches the `startMonth` trap.
5. **Empty profile:** ratio rows render `—` beside a **Set income** button, not blank verdicts and not $9,000.
6. **First run:** the modal saves, a profile is created, and the verdict appears without leaving the calculator. Reload, and the button is gone — the figures are read-only with a link to Settings.
7. `include_in_ratios` off changes the back-end DTI.

Unit: `resolveInputs` parity — given the same values, it produces the `MortgageInputs` the current form produces. API: 401, 403 on another user's profile, 400 on a negative income. Plus updating `tests/unit/scenarios.test.ts` and `tests/20-mortgage-scenarios.spec.ts`, which exercise the two signatures that change.

---

## Open questions

1. ~~**Profile scope.**~~ **Settled 2026-10-17: personal only.** Teams can include agents and assistants, so income is not team-readable. Schema is context-shaped so a team policy can be added later without migrating a table full of income.
2. **How detailed the rehab estimate is.** The plan assumes a per-system estimate (condition plus cost for each system). The alternatives are a quick estimate (sqft × condition level) or line items (quantity × unit cost).
3. **Your own photos.** Upload photos or screenshots to a house in Phase 3, or rely on the listing link for now?
4. **Team members cannot write anything.** Found while writing the Phase 2 RLS,
   2026-10-18. The intention stated for saved scenarios was that team members
   can edit them, but **no team-write policy exists anywhere in this schema** —
   all team policies across every migration are `FOR SELECT` only, including
   `properties` and `analyses`. A team member can read a house and every
   analysis on it and change none of it.

   The Phase 2 tables (`property_comps`, `valuations`, `rentcast_requests`)
   follow the same read-only pattern deliberately, so the schema stays
   consistent rather than having one corner where teams can write.

   **Not part of Phase 2.** Fixing it means deciding whether every team member
   can edit or only some roles, which is an access-control change and wants its
   own plan.

---

## Phase 2 decisions

**Verdict thresholds live in `defaults.ts` as module constants** — settled
2026-10-18. Not per-user columns: the verdicts need to be right against fixed
numbers before anyone tunes them, and making them editable on day one costs six
columns and six inputs before either of us knows whether 15% is the right
figure. Promoting them to the profile later is additive.

**The 70% rule is a figure, not a gate.** `maxOffer = ARV × 0.70 − rehab` is
shown on the screen, but the deal verdict is decided by margin alone. The 70%
rule is a margin rule wearing a different hat, and two gates that can disagree
produce a verdict that cannot be explained in the space a phone gives you.

**Screening is deliberately pessimistic.** The deal verdict uses
`contingencyPhotosPct` until a visit is logged, then `contingencyVisitPct`. A
deal may legitimately move Thin → Works once someone has been inside.

**Financing costs are their own line in the flip, never inside holding cost.**
Holding cost is hand-entered on the profile; financing is derived from the loan
amount and rate, both of which move with the price. Folding the derived number
into the hand-entered one would mean the figure on screen stops matching the
figure you typed. The profile field is therefore labelled *Holding cost (excl.
financing)*.

**Where the financing figure comes from depends on the house** — settled
2026-10-18:

- **A primary financing analysis exists** → take the real numbers from it:
  interest over `holdingMonths` summed from its amortization schedule, plus
  upfront mortgage insurance (FHA UFMIP or the VA funding fee) and the monthly
  MIP/PMI across the hold, plus any points.
- **No financing analysis** (hard money, cash) → the generic estimate:
  `points% × loanAmount + loanAmount × (rate ÷ 12) × holdingMonths`,
  interest-only, which is how a rehab carry actually works.

The flip breakdown **states which source was used**, because the two can differ
by thousands and a number whose origin is invisible is a number nobody can
check.

**`sold` status requires `source = 'manual'`, enforced by a CHECK.** RentCast
reports only Active/Inactive and cannot confirm a sale, so it must not be able
to store one. Counting a withdrawn listing as a sale is the easiest way to
inflate an ARV, and that is worth making impossible rather than carefully
avoiding.
