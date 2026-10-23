# Plan: hard money adds up the same everywhere

Status: **User approved** on 2026-10-23. Asked whether Settings' holding cost
should apply to every loan, the owner said *"That's a good idea"*: it applies
to all loans. Self-reviewed first (see the end).
Branch: `fix/hard-money`, from `main` **after `fix/paste-address` merges**
(one branch at a time).

## The problem

The owner: *"the hard money loan calculations doesn't make sense"*, and *"the
mortgage calculator is putting insurance and property taxes and math is
different from the flip calculator which does[n't] have rehab estimate nor
asks for a down payment."* Asked which rehab input: *"I think the input box was
missing."*

The same loan is worked out three different ways. All of these were checked
against the code:

| Where | How the loan is sized | Monthly cost | Down payment |
|---|---|---|---|
| **Numbers** (`calculateMortgage`) | Like a mortgage: price minus a typed down payment | Interest only, **plus tax and insurance** | Typed % |
| **Deal** (`buildDeal` → `sizeHardMoneyLoan`) | The hard money way: 85% of price plus 100% of rehab, capped at 75% of the resale price | Interest on what is drawn, **no tax, no insurance** | 15% of price, from the 85% |
| **Flip calculator** (`FlipTool`) | Depends on the loan picked, which starts as an **FHA 203(k)** carrying hard money's 15% rate and 2 points | No tax or insurance shown | **Not asked**: a default is used silently |

Five more faults:

1. **The rehab box is missing on Numbers for hard money.** "Renovation cost"
   shows only for renovation loans (`InputPanel.tsx:338`), yet a hard money
   loan is sized partly on the rehab.
2. **Deal leaves real holding costs out for hard money**: tax, insurance and
   utilities while the house is held. Financed loans on the same tab include
   tax and insurance. Hard money looks cheaper than it is.
3. **Hard money closing costs are only the points.** Title and closing fees
   come to $0 (`buildDeal.ts:169`), so cash to close is understated.
4. **Settings' "Holding cost" ($ a month) and "Holding period" are saved and
   used nowhere.** Deal assumes 6 months for hard money (12 for others) and $0
   a month in extras.
5. **Saving the Flip calculator to a house keeps only the price, rehab and
   resale price.** Loan type, rate and points are lost
   (`FlipTool.tsx:126`).

## How hard money closing costs work (for the owner)

A hard money loan has three kinds of upfront cost:

- **Points**: the lender's fee, a % of the loan, commonly 1–3. The app already
  has these.
- **Lender fees**: underwriting, processing and documents. A flat amount per
  loan, often around a thousand dollars or two.
- **Title and closing**: title insurance, the closing attorney (Georgia closes
  with an attorney), recording and an appraisal or valuation. These scale
  roughly with the price.

The exact figures differ by lender, so the plan uses **one editable "Lender
and title fees" figure**. It defaults to **2% of the purchase price**, is
labelled with an ⓘ that says what it covers, and is changed on the lender's
quote. That is a starting point, not a quote.

## Goal

One hard money calculation, used by Numbers, Deal and the Flip calculator. The
same house gives the same loan, down payment, monthly cost, cash to close and
profit on every screen.

## Approach

1. **One model** (`lib/mortgage/hardMoney.ts`, extended in place):
   - **Loan size**: `sizeHardMoneyLoan`, as Deal uses now.
   - **Down payment**: the price minus the purchase advance.
   - **Monthly cost while held**: the interest (Non-Dutch, on what is drawn),
     plus property tax, plus insurance, plus Settings' holding cost.
   - **Closing**: the points, plus lender and title fees.
2. **Numbers** (`calculateMortgage` for `hardMoney`, `InputPanel`):
   - Size the loan through the model rather than "price minus down payment".
   - **Show the Rehab amount box** for hard money.
   - Show the down payment the loan leaves (read-only, with an ⓘ) rather than
     asking for one.
   - Add the "Lender and title fees" field.
3. **Deal** (`buildDeal`):
   - Hard money carry becomes the interest schedule plus tax, insurance and the
     holding cost, over the hold.
   - Buyer closing costs become the lender and title fees.
   - The hold length and holding cost come from Settings when set, falling back
     to today's 6 and $0.
4. **Settings**: "Holding cost" gets its meaning in words: *"Utilities, lawn and
   upkeep per month. Tax and insurance are added on their own."* This avoids
   counting them twice.
5. **Flip calculator**:
   - Starts on hard money, which matches its 15% and 2 points.
   - Switching loan resets the rate and points to that loan's defaults.
   - Shows the down payment the loan leaves, and the tax and insurance.
   - Saving keeps the loan type, rate, points and hard money terms.

## Scope

| File | Change |
|---|---|
| `lib/mortgage/hardMoney.ts` | Monthly-held cost and closing, beside the existing sizing |
| `lib/mortgage/calculate.ts` | The `hardMoney` branch sizes through the model |
| `lib/mortgage/types.ts`, `defaults.ts` | `hardMoneyFeesPct` (default 2) |
| `lib/deal/buildDeal.ts` | Hard money carry and closing, and Settings' hold length and holding cost |
| `components/mortgage/InputPanel.tsx` | The rehab box for hard money, the down payment shown, and the fees field |
| `components/mortgage/FlipTool.tsx` | The default loan, the reset on switch, the down payment and tax lines, a full save |
| `components/settings/DefaultsForm.tsx` | The holding cost hint |
| `tests/unit/hardMoney.test.ts` (exists?) and `flip.test.ts` | Every figure, below |
| `tests/25-calculator-binding.spec.ts` | One journey: a hard money house reads the same loan, down payment and monthly cost on Numbers and Deal |

## Testing

- **Jest, every case.** For one worked house: the same loan, down payment,
  monthly cost and cash to close from Numbers' calculation, Deal's and the Flip
  calculator's. Also:
  - Tax and insurance are in hard money's carry.
  - Fees are in its closing.
  - Settings' hold length and holding cost are applied.
  - The holding cost is not counted twice.
  - A Flip save keeps the loan terms.
- **Playwright, one journey**: pick hard money on Numbers, enter the rehab,
  save, open Deal, and see the same monthly cost and down payment. At 390px.
- `tsc`, lint, build, and a look at 390px.

## Risks

- **Every saved hard money deal's numbers will change**, toward the true cost:
  carry goes up by tax, insurance and holding, and cash to close goes up by
  fees. That is the point, but the owner will see different figures on houses
  he has already looked at.
- **Settings' holding cost starts applying to every loan type**, not just hard
  money. A financed deal gains $750 a month in extras if that is what Settings
  holds. That is correct (utilities don't care about the loan), but it is a
  visible change. **Decided: all loans.**
- No migration: `hardMoneyFeesPct` lives in the saved inputs, which tolerate
  new fields (`readInputs` fills defaults). No data written.

## Out of scope

- DSCR loans.
- Per-lender fee schedules.
- A draw schedule editor beyond what exists.
- The reason-copy fix, which is its own approved branch.

## Approver (self-review)

Written by the same Claude that will build it. **It is not independent.**

- **One model, refactor first**: Numbers and the Flip calculator move onto the
  sizing Deal already uses. Nothing is duplicated.
- **Bugs are fixed in place**: `calculateMortgage`, `buildDeal` and `FlipTool`
  are edited, not replaced.
- **Testing follows the rules**: Jest carries every figure, and one Playwright
  journey proves the two tabs agree on screen.
- **The writing rules are followed**: every new figure says what it is, the
  fees and the down payment get an ⓘ, and Settings' hint says what it covers.
- **Changed by this review**: the first draft let Settings' holding cost
  include tax and insurance. That double-counts them, so the hint now says
  they are separate.

**Recommendation:** approve, with the holding cost applied to all loans. Cut
the branch once `fix/paste-address` merges.

## Outcome (2026-10-23)

- **Numbers** sizes hard money the way Deal does. The rehab box is back. It
  shows the down payment the loan leaves, and the loan as a read-only line
  (advance plus funded rehab). There is a new "Lender and title fees" field
  (2% of the price by default, with the dollar amount shown).
- **Deal**: hard money's carry adds tax, insurance and HOA every month held.
  Closing costs are the lender and title fees, not $0. Settings' holding cost
  and period apply to every deal.
- **A missing ARV** no longer caps a hard money loan to $0.
- **The Flip calculator**:
  - It opens on hard money.
  - Switching loans resets the rate, points and down payment.
  - Mortgage loans get a down payment field (the fixed $12,250 is gone).
  - Saving keeps every loan setting.
- **Settings** says the holding cost is utilities and upkeep, with tax and
  insurance counted on their own.
- **Tests**:
  - Jest: 637 pass. One house gives the same loan and down payment on Numbers
    and Deal, plus cases for fees, tax and insurance, Settings holding, no
    ARV, and the Flip inputs. The three old mortgage-test expectations
    changed on purpose: they encoded "price minus a typed down payment".
  - Playwright: 38 pass, including the new journey (hard money on Numbers →
    Deal shows the same down payment).
  - `tsc` and the build pass. Lint is unchanged.
- **Checked at 390px**: Numbers (the loan line, the rehab box) and the Flip
  calculator.
- **Also on this branch**: the iPhone review-sheet tap fix (`f54231c`), shipped
  ahead as #69.
- **Not done, flagged**: Numbers keeps the mortgage rate (6.75%) when you
  switch to hard money. The Flip calculator resets it to 15%, and Numbers
  could do the same.
