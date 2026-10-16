# Down payment assistance, renovation loans, and the order of the form

**Status: User approved** — 2026-10-16.

---

## Goal

Three problems, one cause: the calculator asks about funding in the wrong order and
models assistance wrongly.

1. Assistance does not cover the down payment. It is a lump that reduces cash to
   close, so the loan amount never responds to it.
2. 203(k) is not in the loan type dropdown. It is a separate "renovation program"
   field 398 lines down the form.
3. Both renovation and assistance are asked near the bottom, long after the
   down payment question they belong with.

## Stack

TypeScript and Tailwind, unchanged. No new dependencies.

---

## What the owner specified

- **$10,000 is a constant**, not an amount to type. It is the award, full stop.
- Assistance covers the **minimum down payment** — 3% conventional, 3.5% FHA.
- **Everything left over goes to closing costs.** There is no unused bucket. The
  leftover subtracts from closing costs and the buyer pays the remainder.
- The buyer must contribute **at least $1,000** of their own money.
- **203(k) belongs in the loan type dropdown.** Selecting it reveals two inputs at
  the top: sales price and renovation cost.
- **Renovation and assistance both move to the top** of the form.

### The arithmetic, worked

$250,000 FHA, 5% closing costs:

| | |
|---|---|
| Minimum down (3.5%) | $8,750 |
| DPA → down payment | $8,750 |
| DPA → closing | $1,250 |
| **DPA allocated** | **$10,000** |
| Closing costs | $12,500 |
| less DPA | −$1,250 |
| **Buyer pays at closing** | **$11,250** |
| Buyer down payment | $0 — covered |

$175,000 FHA, 5% closing costs:

| | |
|---|---|
| Minimum down (3.5%) | $6,125 |
| DPA → down payment | $6,125 |
| DPA → closing | $3,875 |
| **DPA allocated** | **$10,000** |
| Closing costs | $8,750 |
| less DPA | −$3,875 |
| **Buyer pays at closing** | **$4,875** |

The split moves with price and loan type; the $10,000 is always fully allocated.

---

## The 203(k) question, and a recommendation

The owner wants 203(k) in the loan type dropdown. There are two ways to do that and
they are not equivalent.

**Merge it into `LoanType`** — add `fha203k` and `homestyle` alongside
`conventional` and `fha`. They would each need their own MIP rules, ratios and
minimum down, duplicating what `fha` and `conventional` already define. Two places
to change when an FHA rule changes, and they will drift.

**Present it in the dropdown, keep the model orthogonal** — the dropdown lists
Conventional, FHA, **FHA 203(k)**, **HomeStyle**, VA, Hard money, DSCR. Choosing
203(k) sets `loanType: "fha"` and `renovationProgram: "fha203k"` together.

The second is what this plan does. The owner gets exactly the dropdown they asked
for; the model keeps one definition of what FHA means. The existing comment at
`types.ts:19` already makes this argument: *"same insurance, same ratios, same
minimum down. Only the loan sizing changes."* It is right, and nothing in the
request contradicts it — the request is about where the question appears.

---

## The new form order

Everything about *what am I buying and how am I funding it* comes first:

```
1. Purchase
     Loan type        (now including FHA 203(k) and HomeStyle)
     Sales price
     Renovation cost  ← only when a renovation program is selected
     Down payment
     Down payment assistance   ← yes/no toggle, $10,000
2. Rate and term
3. Mortgage insurance / FHA premiums / VA funding fee / hard money
4. Carrying costs
5. Property income
6. Affordability
```

The standalone "Renovation financing" card at line 398 and "Down payment
assistance" card at line 464 are removed; their contents move up. The contingency,
ARV, and assistance structure/rate/term inputs stay behind reveals so the first
card does not balloon for a plain purchase.

## Scope

### `lib/mortgage/`

- **`constants`** — `DPA_AWARD = 10000`, `BORROWER_MINIMUM_INVESTMENT = 1000`.
- **`types.ts`** — `dpaAmount: number` becomes `dpaEnabled: boolean`; the award is
  a constant, not input. Result gains `dpaToDownPayment`, `dpaToClosing`,
  `borrowerCashAtClosing`, `meetsBorrowerMinimum`.
- **`calculate.ts`** — replace `dpaBreakdown` with the two-step allocation. Down
  payment becomes `max(typed, dpaToDownPayment)` so the loan amount responds.
- **`loanTypes.ts`** — a presentation list pairing dropdown options to
  `(loanType, renovationProgram)`.

### `components/mortgage/`

- **`InputPanel.tsx`** — the reorder above, and the loan type dropdown driving both
  fields.
- **`ResultsPanel.tsx`** — show the split: to down payment, to closing, closing
  costs net of assistance, and what the buyer actually brings.

### Untouched

- Amortisation, PMI/MIP, DTI and affordability maths, beyond assistance now moving
  the loan amount — which is the point of the fix.
- `DpaStructure` grant/deferred/amortizing and `dpaPayment`. How it is repaid is a
  separate axis from how it is allocated.

## Approach

1. Allocation function and constants, with unit tests written against the two
   worked examples before any UI changes.
2. Wire into `calculateMortgage` so the loan amount responds to assistance.
3. `dpaAmount` → `dpaEnabled`, including the storage migration below.
4. Loan type dropdown presents the renovation programs.
5. Reorder the form; delete the two old cards.
6. `ResultsPanel` shows the split.
7. Verify, including at 390px.

## Refactors

`dpaBreakdown` is replaced in place, not duplicated. `minDownPercent` stops being
decorative — today it is referenced once, to print a warning, and no calculation
reads it.

## Risks

- **Existing numbers change.** Any scenario with assistance will show a different
  loan amount and payment, because assistance now reduces the loan. That is the
  fix, but it is behavioural.
- **`storage.ts` persists inputs, and `dpaAmount` → `dpaEnabled` is a shape
  change.** A saved scenario carrying `dpaAmount` must load without crashing —
  migrate `dpaAmount > 0` to `dpaEnabled: true`. This is the one genuinely
  breaking change in the plan and needs care.
- **60 mortgage unit tests.** Any encoding the old assistance behaviour get updated
  deliberately — not weakened, not deleted.
- **Affordability moves**, since the loan amount feeds the DTI solve.
- **The form reorder touches a 551-line component.** Mechanical, but large.

## Testing

- Unit tests for allocation: both worked examples, conventional at 3%, VA/USDA at
  0% minimum, the $1,000 floor binding, and a price small enough that the award
  exceeds the minimum down.
- A test that a saved `dpaAmount` scenario migrates to `dpaEnabled`.
- `npx jest`, `npm run build`, `npx tsc --noEmit`, `npm run lint`.
- `npx playwright test` for the mortgage path.
- 390px verification of the reordered card and the results split.

## Out of scope

- The property-tax lookup bug, still open from an earlier session.
- Closing cost estimation itself — only how assistance applies to it.
- Repayment structure behaviour.

---

## Eligibility (settled by the owner)

The assistance toggle appears **only where there is a minimum down payment to
cover**: conventional, FHA, and the two renovation programs that sit on them.

It does **not** appear for VA, USDA, hard money or DSCR. VA and USDA require 0%
down, so there is no minimum for the award to cover and the whole $10,000 would
fall through to closing costs — which is not what the program is for.

Implementation: drive this off `minDownPercent > 0` rather than listing loan types
by name, so the rule stays true if a type's minimum ever changes. Hard money is
excluded despite its 20% minimum, since it is not a program these awards apply to —
that one is an explicit exclusion, not a derived rule.

Selecting an ineligible loan type with assistance already on must clear
`dpaEnabled`, so a hidden toggle cannot leave stale assistance applied to the
result.
