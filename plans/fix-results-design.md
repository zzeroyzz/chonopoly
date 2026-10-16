# Results: answer first, and a combined LTV that can't exceed 100%

**Status: User approved** — 2026-10-16.

---

## Goal

The owner cannot tell what they are looking at. At 390px the page is **3,941px —
nearly five screens** — with no boundary between the fields being typed and the
answers coming back, and four numbers competing to be "the answer":

| | |
|---|---|
| $2,221 | monthly payment |
| $11,250 | cash to close |
| $7,165 | income needed |
| $318,000 | maximum price |

Nothing says which one you came for.

## Stack

TypeScript and Tailwind, unchanged. No new dependencies.

---

## Part 1 — combined LTV is wrong

It reports 102.2% on a $250,000 FHA purchase with assistance. The owner's
objection is correct: the loan cannot exceed the house.

```
base loan (price − down)                $241,250
+ financed UFMIP 1.75%                    $4,222
= first mortgage                        $245,472

current:  (first mortgage + full $10,000) / price   102.2%
correct:  (base loan + down-payment slice) / price  100.0%
```

Two separate errors inflate it:

1. **The whole award is counted**, including the $1,250 that paid closing costs.
   Closing costs do not buy the house, so that money has no place in a
   loan-to-*value* ratio.
2. **Financed UFMIP is folded in.** It is a financed fee, not acquisition.

Fix: `combinedLtv = (baseLoanAmount + dpaToDownPayment) / totalAcquisitionCost`.
In the normal case this is exactly 100% — the mortgage covers 96.5%, assistance
covers the 3.5% down, and together that is the whole house.

The warning that fires above 100% then becomes meaningful again: it will only
appear when something genuinely unusual is happening, rather than every time
assistance is switched on.

Financed fees are still real and still owed. They stay visible on the FHA card as
"Upfront MIP financed into loan", where they already are — they just stop
corrupting a ratio that is about value.

## Part 2 — the results, reorganised

Owner's choice: **answer first, detail on demand.**

```
═══ RESULTS ═══════════════════  ← an unmissable boundary

┌──────────────────────────────┐
│  $2,221 /mo                  │  the answer
│  ✓ Within your income        │  the verdict, next to it
│  needs $7,165 · you have $9,000
└──────────────────────────────┘

┌─ CASH TO CLOSE ──────────────┐
│ Down payment        $8,750   │
│ Closing costs (5%) $12,500   │
│                    ───────   │  a ledger that sums
│                    $21,250   │  where it currently
│ Assistance        −$10,000   │  takes four numbers
│   → down payment     $8,750  │  and mental arithmetic
│   → closing          $1,250  │
│                    ───────   │
│ You bring          $11,250   │
└──────────────────────────────┘

▸ Monthly breakdown            collapsed: P&I, tax, insurance, MIP
▸ The loan                     collapsed: amount, LTV, FHA detail
▸ Over the life of the loan    collapsed: seven reference rows
▸ Current rates                collapsed
```

Nothing is deleted. Everything currently on the page stays reachable; the
reference material simply stops competing with the decision material.

### Why these three

- **The verdict belongs with the payment.** Today "can I afford it" lives
  $2,000px further down, in its own card, with its own competing headline.
- **Cash to close must sum visibly.** It currently lists four figures with mixed
  signs and expects the reader to arrive at $11,250 themselves.
- **"Over the life of the loan" is seven near-identical rows** of reference data
  sitting at the same visual weight as the numbers you act on.

## Scope

- **`components/mortgage/ResultsPanel.tsx`** — the restructure above.
- **`components/mortgage/AffordabilityPanel.tsx`** — the verdict moves into the
  headline card; the detail stays here, collapsed.
- **`components/mortgage/fields.tsx`** — a `Disclosure` component. There is no
  collapsible primitive today, and four sections need one.
- **`lib/mortgage/calculate.ts`** — the combined LTV fix.
- **`lib/mortgage/types.ts`** — document what `combinedLtv` now measures.

### Untouched

- Every calculation other than `combinedLtv`. This is presentation.
- `InputPanel`, just reordered in the previous change.
- The amortisation table.

## Approach

1. Fix `combinedLtv` and its unit tests first — it is the one behavioural change,
   and it should land verified before any visual work.
2. Add the `Disclosure` primitive to `fields.tsx`.
3. Rebuild `ResultsPanel`: verdict headline, cash-to-close ledger, four
   disclosures.
4. Move the affordability verdict up; leave its detail collapsed.
5. Verify, including measuring the page height at 390px before and after.

## Risks

- **`ResultsPanel` is being restructured, not tweaked.** Every figure currently
  shown must still be reachable afterwards — the check is that no field is lost,
  only relocated.
- **A collapsed section is a hidden section.** Default-open vs default-closed is a
  real decision: the plan closes all four, on the grounds that the owner's
  complaint is volume.
- **`combinedLtv` is asserted by an existing test** that expects >100%. It encodes
  the old behaviour and must be rewritten to the new rule deliberately — the
  scenario it covers (a tiny down payment) should still exceed 100%.
- The affordability verdict moving between components risks duplicating its logic.
  It must be read from the same source, not recomputed.

## Testing

- Unit: combined LTV is exactly 100% on $250k FHA with assistance; still exceeds
  100% when the down payment is genuinely too small; unaffected without
  assistance.
- `npx jest`, `npm run build`, `npx tsc --noEmit`, `npm run lint`.
- Playwright on the mortgage path.
- 390px: page height measured before and after, every previously visible figure
  confirmed still reachable, and no horizontal overflow.

## Out of scope

- The property tax lookup. Investigated this session and found working end to end
  — API, lookup, stale detection, "Use this figure" and county override all pass.
- Any change to the mortgage maths beyond `combinedLtv`.
- Desktop layout. It is already two columns and reads fine; this is a mobile
  problem.
