# Mortgage Calculator Page — Build Spec

## How to use this document

Read this file in full, then **produce an implementation plan and stop.**
Do not write code. Do not create files. Do not commit.

Return the plan for approval first, per the standing CLAUDE.md rules:
plan-first always, no commits without instruction, no scope creep,
mobile-first verification required, Plaid connections untouchable.

If anything in this spec conflicts with existing app conventions,
flag the conflict in the plan rather than resolving it yourself.

---

## What this is

A standalone mortgage calculator page inside the Park Properties app.
It is **not** part of the CRM and does not depend on it. It is a tool
used independently of whether a deal exists in a pipeline.

This is the **first** thing being built in this sequence. The CRM comes after.

---

## Scope

**In scope**
- Single page, single view
- Full input panel (see Inputs)
- Full results panel (see Outputs)
- Loan-type-specific calculation logic for 5 loan types
- Front-end / back-end DTI ratio affordability calculation
- Amortization schedule, expandable inline on the same page
- Optional "use current average rate" fill for conventional

**Out of scope**
- Saving or persisting calculations (raise in the plan if it's trivial to add later — do not build it now)
- Any link to CRM entities, properties, or deals
- Lender integrations, pre-approval flows, or rate shopping
- PDF export or print view
- Comparison of two scenarios side by side

---

## Design constraints

Match the existing app exactly. Do not introduce a new design language.

- Existing app design tokens, spacing, and typography
- Mobile-first — PWA with bottom tab navigation; verify mobile before desktop
- CSS Grid with `alignContent: start`
- No `max-width` on full-page views
- Centered modal overlays only, if any modal is needed at all
- Lucide icons for system items (emoji is reserved for user-created items)

The reference screenshot the user provided is a **feature checklist, not a
design reference.** Do not copy its visual style.

---

## Layout

Input panel and results panel on the same page. On mobile they stack,
inputs first. The amortization schedule is an expandable section at the
bottom of the same page — the user explicitly does not want to navigate
away and back.

---

## Inputs

| Field | Type | Notes |
|---|---|---|
| Home value | currency | |
| Down payment | currency **or** percent | Toggle between the two; the other derives |
| Loan amount | currency | Auto-calculated, but editable |
| Interest rate | percent | **Always manually editable.** See Rate fill below |
| Loan term | years | Default 30; common presets 30 / 20 / 15 |
| Start date | month + year | Drives the payoff date and PMI end date |
| Property tax | $/yr | |
| PMI | percent | Applies to conventional only — see Loan types |
| Home insurance | $/yr | |
| Monthly HOA | currency | |
| Loan type | select | Conventional, FHA, VA, Hard money, DSCR |
| Buy or refi | select | |

### Affordability inputs (additional)

| Field | Type | Notes |
|---|---|---|
| Gross monthly income | currency | |
| Other monthly debt payments | currency | Car, student loans, credit card minimums, etc. |

---

## Loan types

Loan type is **not** a cosmetic rate change. It changes which fields are
shown and which formulas run. Handle each explicitly.

### Conventional
- Down payment 3–20%
- PMI applies when down payment is under 20%
- PMI drops off automatically — calculate the month LTV reaches 78% of
  original value, and show both the payment with PMI and the payment after
  it ends
- Qualifies on borrower DTI

### FHA
- Down payment 3.5% minimum
- **UFMIP of 1.75% of the loan amount**, financed into the loan by default
  (add a toggle to pay it at closing instead)
- **Annual MIP** paid monthly, replacing PMI. MIP is **permanent for the
  life of the loan** when the down payment is under 10%; it terminates
  after **11 years** when the down payment is 10% or more
- Hide the PMI field; show MIP instead

### VA
- 0% down allowed
- **No monthly mortgage insurance at all**
- **Funding fee** applies instead — 2.15% for first use with 0% down,
  reduced at higher down payments, higher on subsequent use. Financed into
  the loan by default, with a toggle. Add an "exempt" checkbox
- Hide PMI and MIP entirely

### Hard money
This one breaks the standard amortization model. Give it its own input mode.
- **Interest-only payments** — not amortized
- Term in **months**, typically 6–24, not years
- **Points** paid upfront (percent of loan), shown as a closing cost
- Often sized against **ARV** rather than purchase price — add an optional
  ARV field and an LTV-vs-ARV display
- **Balloon payment** of full principal at term end — show this prominently
- No mortgage insurance
- Amortization section shows an interest-only schedule with the balloon

### DSCR
- Qualifies on **property income, not borrower income**
- Requires: gross monthly rent, vacancy rate, operating expenses
- **DSCR = Net Operating Income / Annual Debt Service**
- Display the resulting DSCR with a pass/fail indicator against a
  configurable threshold, defaulting to **1.25**
- Hide the gross monthly income and other-debt fields — they don't apply
- No mortgage insurance
- Down payment typically 20–25%

---

## Affordability ratios

Show both, with the applicable guideline for the selected loan type.

- **Front-end ratio** = PITI ÷ gross monthly income
- **Back-end ratio** = (PITI + all other monthly debt) ÷ gross monthly income

PITI here means principal + interest + property tax + insurance + HOA +
mortgage insurance.

Guidelines to display:
- Conventional: 28 / 36 traditional; note that automated underwriting
  routinely approves back-end into the mid-40s
- FHA: 31 / 43 manual underwriting standard
- VA: uses residual income alongside DTI — note that residual income is
  not modeled here
- Hard money and DSCR: ratios do not apply — hide this section

Show pass / caution / fail against the guideline. Do not block calculation
on a failing ratio.

---

## Outputs

Everything in the reference screenshot, plus loan-type-specific additions.

- Monthly payment **with** mortgage insurance
- Monthly payment **after** mortgage insurance ends, and the month it ends
- Number of mortgage insurance payments, total paid, and the end date
- Down payment amount and percent
- Loan payoff date
- Total interest paid
- Monthly and total property tax
- Monthly and total home insurance
- Annual payment amount
- Total of all payments
- Full payment breakdown: principal & interest / tax / insurance / HOA / MI

Loan-type additions:
- FHA: UFMIP amount, and whether it's financed
- VA: funding fee amount, and whether it's financed
- Hard money: points cost, total interest over term, balloon amount due
- DSCR: NOI, annual debt service, resulting DSCR, pass/fail

---

## Amortization schedule

- Expandable section on the same page — **not** a separate route
- Per-period: payment number, date, payment amount, principal, interest,
  remaining balance
- Collapsible to annual summary rows, expandable to monthly
- Mark the row where mortgage insurance ends
- For hard money: interest-only rows plus the balloon row

---

## Rate fill

The interest rate field is **always manually editable and always
authoritative.** The user will frequently model a rate a specific lender
quoted, or a hypothetical.

Add a small optional control — "use current average" — that fills the field
with a fetched rate. It never overrides a value the user typed and never
runs automatically on load.

- **Source: Freddie Mac Primary Mortgage Market Survey**, available free
  via the FRED API as series `MORTGAGE30US`. Weekly, not daily
- FHA and VA rates track conventional with a spread — if fetched values for
  those aren't available, either omit the fill for them or clearly label it
  as an estimate
- Hard money and DSCR rates are not published centrally — **manual entry
  only**, no fill control
- Label the fetched value with its source and date. Fail silently to manual
  entry if the fetch fails

Raise in the plan where the fetch should live (server route vs. client) and
whether an API key is needed.

---

## What to deliver

An implementation plan covering:

1. Route and navigation placement
2. Component structure
3. Where the calculation logic lives, and how loan-type branching is handled
4. State management approach
5. Which existing app components and design tokens you'll reuse
6. The rate-fetch approach and where it sits
7. Mobile layout approach for the stacked panels and the amortization table
8. Test coverage plan (Playwright / Jest, matching the existing suite)
9. Any conflicts with existing conventions, flagged rather than resolved
10. Anything in this spec that is ambiguous or that you'd recommend changing

Then stop and wait for approval.
