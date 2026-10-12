# CASH-FLOW-ANALYSIS.md

Feature spec for the Cash Flow Analysis module in the Park Properties Finance App.
Read alongside `CLAUDE.md`. All existing rules still apply — plan-first, no commits
without instruction, no scope creep, mobile-first verification, Plaid untouchable.

---

## 1. Purpose

Evaluate a single rental property as an investment. Inputs are purchase, financing,
income, and expenses; outputs are cash flow, returns, and a long-run projection.

Field structure is modeled on the BiggerPockets rental calculator, which the owner
uses today. That tool is the functional reference — not a design reference.

## 2. Where this sits

Three modules, three questions, three separate concerns:

| Module | Question | Level |
|---|---|---|
| Market Analysis | Which metro should I shop in? | Metro / county |
| **Cash Flow Analysis** | **Is this specific house a good deal?** | **Property** |
| Mortgage Calculator | What does this loan cost? | Loan |

Do not merge them. Market Analysis explicitly lists deal-level cash flow as a
non-goal; this module is where that lives.

**Reuse `lib/mortgage/` for amortization.** The mortgage calculator already has a
tested amortization engine, loan-type rules, and schedule generation. This module
consumes it — it must not reimplement payment math. If the existing signature
doesn't fit, extend it rather than forking it, and say so in the plan.

## 3. Non-goals

- Wholesale/assignment math (ARV × 70% − repairs − fee). That belongs to the CRM's
  deal calculator, not here
- Automated MLS or listing ingestion
- Comps or ARV lookup
- Any write path touching Plaid data
- Sharing reports publicly
- Flip / BRRRR / short-term-rental variants. Buy-and-hold rental only for v1

## 4. Inputs

Grouped as below. Group order mirrors the research workflow — keep it.

### 4.1 Property information
- Address (required)
- Bedrooms, bathrooms, square feet, year built — all optional
- Description, photo — optional

### 4.2 Purchase details
- **Purchase price** (required)
- **Purchase closing costs** (required) — single total, with an optional itemized
  breakdown that sums into it:
  Title & escrow fees · Appraisal fees · Inspection costs · Attorney charges ·
  Recording fees · Annual assessments · Prepaid property taxes · Prepaid flood
  insurance · Prepaid hazard insurance · Points / origination fee · Other

  Note for Georgia: attorney charges are not optional here — every GA closing
  requires one. Consider seeding a default.

- **Rehab toggle.** When on:
  - After Repair Value (ARV)
  - Repair costs — single total, with optional itemized breakdown:
    Roofing · Flooring · Landscaping · Painting · Electrical · Plumbing · Concrete ·
    Gutters/Fascia · Septic · Foundation · Deck/Fencing · Demolition · Cabinets ·
    Windows/Doors · Carpentry · HVAC · Permits · Other

  The itemized fields are an aggregator: when the user itemizes, the total becomes
  derived. When they don't, the total is directly editable. Both directions must work.

### 4.3 Financing
- **Cash purchase checkbox** — when checked, hide the whole financing block and
  zero debt service
- Down payment, enterable as **dollars or percent**, each deriving the other
  (default 20%)
- Loan amount — derived from purchase price minus down payment, editable
- Interest rate — manual entry, always. Same rule as the mortgage calculator:
  no auto-fill
- Loan term in years (default 30, cap 50)
- Points charged by lender

### 4.4 Rental income
- **Gross monthly income** (required) — total, with optional breakdown:
  Rent · Laundry · Water reimbursement · plus **user-added custom line items**
  (label + amount, removable)

### 4.5 Expenses
Two kinds, and the distinction matters:

**Fixed dollar amounts**
- Property taxes (required) — with an **annual / monthly** period selector
- Insurance (required) — same period selector
- Monthly: Electricity · Gas · Water & Sewer · HOA fees · Garbage · Other

**Percentages of gross monthly income**
- Repairs & maintenance
- Capital expenditures
- Vacancy
- Property management fee

Label this clearly in the UI. Mixing the two silently is the commonest source of
wrong numbers in these tools.

### 4.6 Growth assumptions (collapsed by default)
- Annual property value growth — default 2%
- Annual income growth — default 2%
- Annual expenses growth — default 2%
- Sales expenses — default 7% of final sale price

---

## 5. Outputs

### 5.1 Headline
- Total monthly income
- Total monthly expenses (fixed + variable, itemized)
- **Monthly cash flow**
- Monthly mortgage payment
- Total cash needed to close (down payment + closing costs + repairs)

### 5.2 Returns
- **Net Operating Income** — income minus operating expenses, **before debt service**
- **Cap rate** = NOI / purchase price
- Pro forma cap rate
- **Cash-on-cash ROI** = annual cash flow / total cash invested

### 5.3 Expense detail
Monthly vacancy cost · monthly maintenance cost · monthly capex cost ·
monthly management fee · monthly property taxes · total fixed monthly ·
total variable monthly

### 5.4 The 50% rule sanity check
- 50% rule expenses = gross rent × 0.5
- 50% rule cash flow = that, minus the mortgage payment

Show it. It is a deliberately crude cross-check against optimistic expense
assumptions, and when it disagrees sharply with the detailed number that
disagreement is the useful signal.

### 5.5 Long-run projection
A row per year at **0, 1, 2, 3, 4, 5, 10, 15, 20, 30**, each with:

- Total annual income
- Total annual expenses
- Total annual cash flow
- Cash-on-cash ROI
- Property value
- Equity
- Loan balance
- Total ROI compound growth rate
- **Total profit if sold** — net of the sales expense rate

Plus a headline **five-year annualized return**.

Growth compounds annually off the rates in 4.6. Loan balance comes from the
amortization schedule in `lib/mortgage/`, not a separate calculation.

---

## 6. Persistence

Unlike the mortgage calculator, analyses **are saved**. A user runs many of these
and compares them over time.

- One table, `public.analyses`, one row per analysis per user
- RLS scoped with the same `resolveContext` owner pattern every other table uses
  (`owner_type` / `owner_id`) — two users on a shared workspace both see them
- Derived outputs are **computed, never stored**. Store inputs only. A stored cap
  rate goes stale the moment an input changes
- Archive rather than hard-delete
- List view: address, purchase price, monthly cash flow, cash-on-cash, updated date

## 7. Conventions

- Centered modal overlays only
- CSS Grid with `alignContent: start`
- No max-width on full-page views
- Lucide icons for system items; emoji only for user-created
- Mobile-first, verified at 375–390px before anything is called done
- Currency inputs: masked display with an unmasked numeric value underneath, and
  `inputMode="decimal"` so phones raise the numeric pad

## 8. Build order

Ship and verify each phase before starting the next.

1. **Schema + input form + headline outputs.** Property, purchase, financing,
   income, expenses. Monthly cash flow, NOI, cap rate, cash-on-cash. Save and load.
2. **Itemized breakdowns.** Repair costs, closing costs, income line items, custom
   fields. The aggregator behavior in both directions.
3. **Long-run projection.** Year rows, equity, profit if sold, compound growth.
4. **Analyses list + comparison.** Side-by-side across saved analyses.

## 9. Acceptance criteria

Phase 1 is done when:

- An analysis saves, loads, and edits, and RLS blocks another user's rows
- Cash purchase zeroes debt service and hides financing without breaking returns
- The annual/monthly period selector on taxes and insurance produces correct
  monthly figures both ways
- Percentage-based expenses recompute when gross income changes
- Cash-on-cash uses total cash invested — down payment plus closing costs plus
  repairs — not the down payment alone
- Payment math comes from `lib/mortgage/`, with no duplicated amortization code
- The form is usable at 375px with no horizontal scroll

## 10. Verification

Before trusting output on a real deal, check one full analysis against the
BiggerPockets rental calculator with identical inputs and report every field that
differs. Unit tests written alongside the math cannot catch a misunderstood
formula — an outside reference can.
