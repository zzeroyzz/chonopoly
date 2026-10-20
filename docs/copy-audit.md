# Copy audit

**Audit only. No code changed.** Every user-facing string, grouped by screen,
with what it says now and what it should say.

Measured against the writing standard added to `CLAUDE.md`: write for a
first-time investor, every number says whether it is good or bad and why, every
verdict says what to do about it, no internal words.

**⚠️ = a number or verdict shown with no explanation.** These are the ones that
actively mislead rather than merely read poorly.

> **Scope note.** Audited against `main`. Two screens — the Deal step and the
> four-step stepper — exist only on the unmerged `feat/one-path` branch, so
> their rows below describe the intended screens rather than shipped ones.

---

## The recurring problems

1. **Numbers with no verdict attached.** "Cash to close $12,085" tells you a
   fact. It does not tell you whether you have it.
2. **Percentages with no denominator.** "12% margin" — of what? Resale price,
   purchase price, cash in? Three different numbers.
3. **Internal vocabulary on screen**: *analysis*, *scenario*, *primary*,
   *carry*, *provisional*, *unassigned*, *context*.
4. **Verdicts with no remedy.** "Thin" and "Doesn't qualify" state a conclusion
   and stop.
5. **Empty states that describe absence** rather than offering the action.

---

## Properties (the list)

| Current | Proposed |
|---|---|
| *(no page intro)* | **"Every house you're looking at, and what each one would make you."** |
| `Qualifies` / `Tight` / `Doesn't qualify` | Keep the chip, add the reason beneath — see below ⚠️ |
| `Works` / `Thin` / `Doesn't work` | Keep, add the reason ⚠️ |
| `Unreviewed` | **"ARV not checked"** — and link it to the ARV step |
| `$40,000 true profit at 12% margin` ⚠️ | **"You'd keep $40,000 — 12% of the $325,000 resale price."** |
| `Walk-away $77,064 · True profit $44,905` ⚠️ | **"$77,064 lands in your account at closing. After the cash you put in and the months you hold it, you keep $44,905."** |
| `Back DTI 38%` ⚠️ | **"38% of your income would go to debt. Lenders stop at 43%."** |
| `Cash to close $12,085` ⚠️ | **"$12,085 to close. You have $60,000."** |
| `n/a` / `—` for DTI | **"Doesn't apply — this loan is judged on the house, not your income."** |
| `No houses yet.` | **"No houses yet. Add one and we'll work out what it's worth and what it would make you."** + the Add button |
| `Set your income` chip | **"Add your income to see whether you can afford these."** |
| `Address needs a check` | **"We matched this address to one already on file. Worth confirming it's the same house."** |
| `4/4` progress | **"Ready for an offer"** / **"Next: work out the resale price"** |

**Failing-verdict sentences** (one per card, replacing the shorthand):

- Doesn't qualify → *"You'd be $3,218 short at closing."*
- Tight → *"You'd have $1,915 left afterwards — under three months of payments."*
- Thin → *"You'd keep $13,466. That's under the $25,000 this needs to be worth doing."*
- Doesn't work → *"At this price you'd lose $4,200."*
- No ARV → *"No resale price yet, so there's nothing to judge."*

---

## Property page — header and stepper

| Current | Proposed |
|---|---|
| `Not on the pipeline — screening only.` | **"You're not tracking this one yet. Add it to the pipeline to log calls and follow-ups."** + button |
| `Mark finalist` / `Finalist` | **"Shortlist"** / **"Shortlisted"** |
| Step label `Numbers` | **"The loan"** |
| Step label `Deal` | **"What you'd make"** |
| Step label `Details` | **"The house"** |
| Step label `ARV` | **"What it's worth"** ⓘ *ARV = what the house sells for once the work is done.* |
| `Next: Deal` | **"Next: see what you'd make"** |
| `Rehab` tab | **"Repairs"** |
| `Activity` tab | **"History"** |
| Step values `3 bd · 1,200 sqft` | Keep — these are facts, not judgements |

---

## Property page — ARV step (currently "Comps")

| Current | Proposed |
|---|---|
| `Comps` | **"What it's worth"** ⓘ *Comps = recently sold houses nearby, used to work out the price.* |
| `Provisional ARV` ⚠️ | **"$325,000, but we haven't checked these yet"** |
| `$186/sqft · 6 comps` ⚠️ | **"Based on 6 nearby houses at about $186 per square foot."** |
| `Removed` (comp status) | **"Off the market — may or may not have sold"** |
| `Active` | **"Still for sale"** |
| `Sold` | **"Confirmed sale"** |
| `No comps yet.` | **"No nearby sales yet. Pull them from RentCast, or add one your agent sent you."** + both buttons |
| `No API key configured` | **"Comps aren't connected yet. Add a RentCast key in Settings, or enter sales by hand."** |
| `Quota exhausted` ⚠️ | **"You've used this month's 50 comp lookups. You can still add sales by hand."** |
| `Refresh (uses 1 request)` | **"Get fresh sales — uses 1 of your 50 this month"** |

---

## Property page — the loan step (currently "Numbers")

| Current | Proposed |
|---|---|
| `No analyses on this house yet.` ⚠️ | **"You haven't worked out a loan for this house yet."** + "Work out the loan" |
| `Run the numbers` | **"Work out the loan"** |
| `Another scenario for this house` | **"Try a different loan"** |
| `Used for profit` badge | **"Using this one"** |
| `Make primary` | **"Use this one"** |
| `Saved 3 times · History` | **"Changed 3 times — see earlier versions"** |
| `Named after the house. Call it "203(k) with DPA"` | **"This one's named after the house. Call it "203(k) with DPA" instead?"** |
| `FHA 203(k) renovation · Deferred DPA $10,000` ⚠️ | Keep, add ⓘ on *203(k)* (*a loan that covers the house and the repairs together*) and *DPA* (*down payment help — $10,000 here, repaid when you sell*) |
| `$1,500/mo` ⚠️ | **"$1,500 a month"** — and on the card, whether that clears |
| `v2` | **"Version 2"** |

---

## Property page — the Deal step

| Current | Proposed |
|---|---|
| `What this deal makes` | **"What you'd make"** |
| `Based on: 203(k) with DPA` | **"Using your 203(k) with DPA loan"** |
| `Walk-away cash` ⚠️ | Keep the label, add ⓘ *the money that lands in your account at closing* |
| `True profit` ⚠️ | Keep, add ⓘ *what's left after the cash you put in and the months you held it* |
| `Loan payoff at sale` ⚠️ | **"Paying off the loan"** |
| `from the financing analysis` | **"from your loan"** |
| `Balance after 12 months` | **"What you'd still owe after 12 months"** |
| `Interest only, so the whole loan is repaid at sale` | **"You only pay interest, so the whole loan comes back out of the sale."** |
| `Seller closing costs` ⚠️ | **"Your costs to sell"** — *6% of the resale price* |
| `DPA repayment` | **"Paying back the down payment help"** |
| `Capital gains` ⚠️ | **"Tax on the gain"** — keep the working, keep "estimate" |
| `Estimate · $124,750 gain × 24% federal + 5.39% state · held a year or less` | **"Rough estimate. You'd gain $124,750, taxed at 24% federal plus 5.39% Georgia because you held it under a year."** |
| `Cash in · $12,085` ⚠️ | **"You'd put in $12,085"** |
| `Rehab paid in cash` | **"Repairs you pay for yourself"** |
| `Holding · $20,074` ⚠️ | **"Months of payments while you work on it: $20,074"** |
| `Carry over the hold` | **"Payments while you hold it"** |
| `One more month costs $2,750` ⚠️ | **"Every extra month costs you $2,750 of profit."** |
| `Monthly extras` | **"Other monthly costs (utilities, lawn, insurance)"** |
| `overridden` / `reset` | **"you changed this"** / **"use ours"** |
| `No ARV yet, so there is nothing to work back from.` | Good already — keep |
| `Save this analysis` | **"Save this"** |

---

## Make an offer

| Current | Proposed |
|---|---|
| `Make an offer` | Keep. Intro: **"Try a price and see what it does to your profit."** |
| `70% rule` ⚠️ | **"The 70% rule says $177,500"** ⓘ *a rule of thumb: 70% of the resale price, minus repairs* |
| `ARV × 70% − rehab. The convention, not a verdict.` | **"A rule of thumb lots of investors use. Not a judgement on this house."** |
| `Hits your $25,000 floor` ⚠️ | **"Pay $169,200 or less and you'd still clear $25,000."** |
| `Found by searching the deal: price moves the loan, the carry and the tax.` | Cut. The standard says don't explain the method unless asked. |
| `No price reaches it` | **"No price fixes this one — the repairs, the months or the fees are what's wrong."** |
| `drafted / submitted / countered / accepted / rejected` | **"Thinking about it / Sent / They countered / Accepted / Turned down"** |
| `+$2,000 vs asking` ⚠️ | **"$2,000 more than they're asking"** |

---

## Repairs (currently "Rehab")

| Current | Proposed |
|---|---|
| `Budget only` ⚠️ | **"Just your estimate — nobody's priced the work yet"** |
| `From the photos` / `From the visit` | **"Worked out from the listing photos"** / **"Worked out from walking the house"** |
| `Contingency (20% · photos)` ⚠️ | **"Padding for surprises: 20%, because this came from photos"** ⓘ |
| `Budget $45k · Estimate $51k · $6k over` ⚠️ | **"You budgeted $45,000. The work looks like $51,000 — $6,000 more."** |
| `The loan was sized on the budget, so the extra $6,000 is cash you bring` | **"Your loan only covers $45,000, so the extra $6,000 comes out of your pocket."** |
| `Re-run the numbers at $51,000` | **"Redo the loan at $51,000"** |
| `3 systems marked for work with no cost yet.` | Good — keep |
| `Schedule visit` | **"Plan a walkthrough"** |
| `Mark this as from the visit (10% contingency)` | **"I've walked this house"** — *drops the padding to 10%* |
| `Good / Repair / Replace` | Keep — already plain |

---

## Add a house

| Current | Proposed |
|---|---|
| `Add a house` | Keep. Intro already good. |
| `One house` / `Paste several` | Keep |
| `Parcel number` | Keep + ⓘ *the county's id for the land — helps us not add the same house twice* |
| `Image URL` | **"Photo link"** |
| `Uploading a photo needs the property-images bucket, which is written but not created yet.` ⚠️ | **"Paste a link to a photo. Uploading from your phone is coming."** — *"bucket" is an internal word* |
| `Add and find the ARV` | **"Add it and work out what it's worth"** |
| `Comps are pulled per house, from its Comps tab.` | **"We'll look up nearby sales once you open the house."** |
| `address, city state zip, price, link` | Keep — it's a format example |

---

## Pipeline

| Current | Proposed |
|---|---|
| *(no intro)* | **"The houses you're actively chasing, and what's next on each."** |
| `New lead / Contacted / Qualified / Offer / Under contract / Closed / Dead` | **"Dead"** → **"Passed"**; rest are fine |
| `79d in stage` ⚠️ | **"79 days at this stage"** |
| `No follow-up set` ⚠️ | **"Nothing scheduled — this one could go quiet."** + "Set a follow-up" |
| `Overdue` ⚠️ | **"Follow-up was due 4 days ago"** |
| `Add a house` | Keep |

---

## Compare

| Current | Proposed |
|---|---|
| `2 houses · every figure from the same calculation as each house's Profit card` | **"Two houses side by side. The best number in each row is highlighted."** |
| `Pick 2 to 4 houses to compare.` | Good — keep |
| Row `Return on cash` ⚠️ | Keep + ⓘ *profit as a share of the cash you put in* |
| Row `Gap` ⚠️ | **"Repairs over budget"** |
| Row `One more month` ⚠️ | **"Cost of one extra month"** |
| `Budget only` | **"Not priced yet"** |

---

## Tools

| Current | Proposed |
|---|---|
| `Mortgage calculator` | Keep. Intro: **"Work out a payment without attaching it to a house."** |
| `Flip profit` | Keep. Intro: **"What a flip would make, before you commit to the house."** |
| `Quick math — nothing to fill in but the numbers.` | Good |
| `Save to a house (optional)` | **"Keep this on one of your houses"** |
| `No house matches. Houses are added from + Add — saving here never creates one.` | **"No match. Add the house first, then come back."** |
| `Sales price` ⚠️ | Keep + show whether the payment clears their ratios |
| `Loan amount` `auto` | **"We work this out"** |
| `Interest rate` `manual entry` | **"You set this"** |

---

## Settings

| Current | Proposed |
|---|---|
| `Loan & cost defaults` | **"Your usual numbers"** — *"Set these once and every house uses them."* |
| `Income & debts` | Keep. Intro: **"What lenders will count. Set it once."** |
| `Count this in my ratios` | **"Lenders should count this"** |
| `"6000" has no monthly amount. Put the name in the first box and the amount in the second.` | Good — keep |
| `Contingency — after a visit` ⚠️ | **"Padding after you've walked the house"** ⓘ |
| `Federal — ordinary` / `Federal — long-term` ⚠️ | **"Your tax rate if you sell within a year"** / **"…after a year"** |
| `Holding cost (excl. financing)` ⚠️ | **"Monthly costs while you hold it — not the loan payment"** |
| `County loan limit` ⚠️ | Keep + ⓘ *the most an FHA loan can be in your county* |
| `DSCR threshold` ⚠️ | Hide unless a DSCR loan is selected |
| `Saved.` | Keep |

---

## Errors and empty states

| Current | Proposed |
|---|---|
| `Failed to load (HTTP 500)` ⚠️ | **"Couldn't load your houses. Check your connection and try again."** + Retry |
| `Unauthorized` | **"You've been signed out. Sign in again to continue."** |
| `Forbidden` | **"You don't have access to this."** |
| `Property not found` | **"That house isn't here any more."** + back to Properties |
| `Invalid body` / `label is required` | **"Give this a name before saving."** |
| `Send property_id. Houses are created from Add, not from here.` ⚠️ | **"Pick a house from the list. New houses are added from + Add."** |
| `Offers need the offers migration to be run first` ⚠️ | **"Offers aren't switched on yet."** |
| `Mock mode is on, so RentCast comps was not written.` ⚠️ | **"We're using sample data here, so nothing was saved."** |
| `Could not save` | **"That didn't save. Try again?"** |
| `Working it out…` | Keep |
| `Loading…` | Keep |

---

## Tap-to-explain (ⓘ) definitions

One sentence each, plain:

- **ARV** — what the house would sell for once the work is done.
- **PITI** — your monthly payment: loan, interest, taxes and insurance.
- **DTI** — the share of your monthly income that goes to debt.
- **DPA** — down payment help, which you may have to pay back when you sell.
- **203(k)** — an FHA loan that covers the house and the repairs together.
- **Cap** — the most a lender will give you on this house.
- **Comps** — recently sold houses nearby, used to price this one.
- **Margin** — your profit as a share of the resale price.
- **Walk-away cash** — the money that lands in your account at closing.
- **True profit** — what's left after the cash you put in and the months you held it.
- **Holding costs** — what you pay each month while you own it and can't sell.
- **Points** — a fee paid upfront to the lender, as a % of the loan.
- **Reserves** — cash left over after closing, for surprises.

---

## Suggested order

1. **The ⚠️ rows on Properties and the Deal step.** Most-looked-at numbers,
   worst explained.
2. **Errors and empty states.** Smallest change, stops the app looking broken.
3. **The ⓘ definitions.** One component, used everywhere.
4. **Step and tab labels.** Cosmetic but sets the vocabulary.
5. **Settings.** Least often seen.
