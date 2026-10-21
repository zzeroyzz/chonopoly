# Plan: the top of a house's page should answer the question

Status: **Revised (rev 2)** — 2026-10-21, after a self-review. Awaiting the owner. No code written.
Branch: `feat/house-header`, cut from `92a12d6` — the PR #59 merge, tip of
main. Stage B is in.
RentCast requests: **0**.
Design system: https://claude.ai/artifact/AfFqeoXw92zbqvYSFpchrx — `screens.md`.

## The problem

The header of a house's page is the first thing seen and it answers nothing.
Reading it top to bottom today:

> **1653 Sylvan Rd SW** · Atlanta, GA, 30310 · *View on Zillow* ·
> **$149,900** · `TIGHT` `NO ARV` `REVIEW COMPS` · Mark finalist · Edit ·
> New lead · 3d in stage · Parcel · Type · Beds/baths · Sqft · Year built

Six specific faults, each verified in the code:

**1. Both verdicts are painted the same colour.**
`PropertyDetailPage.tsx:475,484` pass
`toneClassName="bg-(--color-base) text-(--color-text-secondary)"` to **both**
`VerdictTag`s, hardcoded. So *Works* and *Doesn't work* look identical, and
*Qualifies* looks like *Doesn't qualify*. The verdict's tone — the whole point
of a verdict — carries no information at all.

**2. The two answers the app exists to give are 10px uppercase.**
`VerdictTag.tsx:137` is `text-[10px] uppercase tracking-wider`. "Can we afford
it?" and "Does the deal work?" are the reason this page exists, rendered
smaller than the parcel number.

**3. "NO ARV" is banned jargon, twice over.**
`PropertyDetailPage.tsx:323`: `row.deal.hasArv ? DEAL_LABEL[...] : "No ARV"`.
The writing rules forbid ARV in the interface and require a verdict to say
what to do. "NO ARV" says neither. Same for "REVIEW COMPS" — *comps* is on the
banned list.

**4. The asking price is muted.** `:441` renders it in
`text-(--color-text-secondary)` at `text-[12px]` mono — the one number every
other number on the page is derived from, painted as an aside.

**5. Walk-away and profit are unlabelled until you read to the end.**
`:449-466` renders `$149,900 · $12,400 walk-away · $8,100 profit` as one mono
run. Three figures in a row where the reader has to reach the word after each
to learn what it was.

**6. The parcel number outranks the house.** `:604-619` lays out Parcel,
County, Type, Beds/baths, Sqft, Year built as six equal cells. Parcel is an
identifier nobody reads twice; beds, size and year are what every comparison
on the other five tabs is made against.

## Goal

A header that answers *can we afford it* and *does the deal work* at a glance,
in words and colour, with the house's own facts under it and the paperwork out
of the way.

## Stack

TypeScript strict, Tailwind utilities, tokens from `globals.css`. No new
dependencies. Read `node_modules/next/dist/docs/` before component work —
Next 16.2.4, React 19.2.4.

## Approach

### 1. The verdicts get their tone back

`VerdictTag` already takes `toneClassName`; the call sites throw the
information away. Each verdict maps to its own ink, as the comp status pills
now do:

| Verdict | Ink |
|---|---|
| Works · Qualifies | `--color-accent` |
| Thin · Tight | `--color-warning` |
| Doesn't work · Doesn't qualify | `--color-danger` |
| Set your income · nothing to judge yet | `--color-text-secondary` |

A `Record<AffordabilityVerdict, string>` and a `Record<DealVerdict, string>`,
so the compiler holds them — **not** `Record<string, string>`, which is how a
Pending comp nearly shipped wearing the Active pill in the last branch.

### 2. They get the size of an answer

Two lines at the top of the header, above the price, each reading as a
sentence rather than a tag:

> **Tight** — $1,915 left after closing, under three months of payments
> **Doesn't work yet** — no resale price until you check the houses nearby

Still `VerdictTag` underneath, so the explanation and "See full breakdown"
stay. The tag is no longer 10px uppercase.

### 3. The jargon goes

| Now | Becomes |
|---|---|
| `NO ARV` | `No resale price yet` |
| `REVIEW COMPS` | `Check houses nearby` |
| `ARV $318,500 · 4 approved` | `Worth $318,500 fixed up · from 4 houses` |

`DEAL_LABEL` stays as it is — *Works · Thin · Doesn't work* are already plain.
Only the no-ARV fallback at `:323` changes, and the ARV tag's label.

### 4. The price leads, and the figures say what they are

The asking price at `figure` size in primary ink. Walk-away and true profit
become two labelled figures beneath it rather than a mono run, each with its
label above it so the eye never has to read past a number to learn what it
was. Both get an `Explain` chip — *walk-away cash* and *true profit* are both
on the jargon list.

### 5. The facts are the house, not the paperwork

Beds / baths · size · year built · type, as one line under the price, the way
a comp card reads. **Parcel and County move behind an "Ids" disclosure** —
kept, not deleted, because a parcel number is the thing you need exactly once
and cannot guess.

### 6. What is not changed

The stage pill, `Mark finalist`, `Edit`, the Zillow link and the tab bar all
stay where they are and keep their behaviour. This plan is the block between
the address and the tabs.

## Scope

| File | Change |
|---|---|
| `components/crm/PropertyDetailPage.tsx` | the header block, `:410-620` |
| `components/mortgage/VerdictTag.tsx` | a size variant; existing default untouched |
| `lib/mortgage/verdicts.ts` | **read only** — `DEAL_LABEL` and `AFFORDABILITY_LABEL` are correct already |
| `tests/unit/verdicts.test.ts` | the tone maps are exhaustive |
| `tests/24-screen.spec.ts` | **asserts the exact strings — see below** |

**Not in scope and therefore not touched:** `components/properties/PropertiesPage.tsx`
renders the same `VerdictTag` in the list. Giving the tags real tone will
change how they look there too — **that is the point**, but it is a second
screen and the PR must say so.

## Risks

- **`VerdictTag` is shared, by six call sites, not four**: three in
  `PropertyDetailPage` and **three** in `PropertiesPage`. Rev 1 undercounted
  the list. A size variant defaults to today's behaviour so the list is
  unchanged until it opts in.
- **`toneClassName` becomes meaningful**, which changes the list's appearance.
  Intended, named here.
- Hiding Parcel behind a disclosure is **hiding, not deleting**.
- No change to auth, RLS, env, CI, lockfiles, migrations, or any Plaid path.
- **No migration. No database change of any kind.**

## Testing

- Unit: the two tone maps cover every verdict value (`Record` exhaustiveness
  plus a test that no verdict maps to the empty string).
- Unit: the no-resale-price fallback says the plain words, not "No ARV".
- **Playwright: deferred, consistent with the last two branches.** The job is
  commented out in CI.

  **But the coupling is real and specific, and rev 1 pointed at the wrong
  file.** `tests/24-screen.spec.ts` asserts these strings exactly:

  | Line | Assertion |
  |---|---|
  | 110 | `verdict-afford-prop-1` has text `"Qualifies"` |
  | 111 | `verdict-deal-prop-1` has text `"Works"` |
  | **147** | `verdict-deal-prop-1` has text **`"No ARV"`** |
  | 174 | `verdict-afford-prop-1` has text `"Set your income"` |

  Line 147 **will break by design** when the jargon goes. Lines 110, 111 and
  174 survive unchanged, because `DEAL_LABEL` and `AFFORDABILITY_LABEL` are
  not being touched.

  That one assertion is updated **as part of this change, with the reason
  recorded here first**: the string is deliberately different, not failing.
  The Tier 3 rule is about rewriting a test to make a red result go away;
  this is naming the change before making it, which is what the Stage A plan
  promised for its two tests and did not deliver.
- Gate: `npm run build`, `tsc --noEmit`, `npm run test:unit`, and **looked at
  at 390px** — six faults above are visual and the last two branches both
  shipped layout bugs that only a screenshot caught.

## Drift from the approved plan — 2026-10-21

Two departures, both recorded rather than quietly taken.

**1. Three more files than the plan named, for one reason.** `"No ARV"` was
written out as a literal in **three** places: the house page, `PropertiesPage`
`:469` and `ComparePage` `:71`. Changing only the one in scope would have left
three screens wording the same verdict three ways, which is what `VerdictTag`'s
own doc comment forbids. So there is now a single `NO_RESALE_PRICE_LABEL` in
`lib/mortgage/verdicts.ts` — a file the plan called read-only — and all three
read it.

That also means `tests/24-screen.spec.ts:147` **does** break, as the plan
predicted, but via the list rather than the header: rev 2 said the header would
break it, and the header does not use that testid. Updated, with the reason in
a comment above the assertion.

**2. The tone maps already existed.** The plan proposed writing
`Record<AffordabilityVerdict, string>` and `Record<DealVerdict, string>`. They
were already in `PropertiesPage` and correct; the house page simply never used
them. They moved to `VerdictTag` — the component both pages import — rather
than being written a second time.

## Found and NOT fixed — needs its own decision

`lib/deal/explainDeal.ts` is full of the same banned words, in the popover this
change makes more prominent:

| Line | Text |
|---|---|
| 167 | "A resale price worked out from **comps** that have been reviewed." |
| 168 | "Add **comps** on the **ARV** step." |
| 229 | "The $X resale price uses **comps** you haven't reviewed." |
| 260 | "Add **comps** on the **ARV** step and **tick** the ones that have been renovated." |

Line 260 is worse than jargon: **the tick stopped existing** when the review
control replaced it, so it tells the owner to use something that is gone — the
same defect found in `fixerUpperNote` last branch.

Not touched. `explainDeal.ts` is not in this plan's scope, the fix is a dozen
strings rather than a mechanical rename, and this branch has already drifted
twice. It wants its own pass.

## Out of scope

- The Deal tab's verdict levers. Still unbuilt, still the biggest gap.
- The properties list beyond what the shared tag changes.
- Re-enabling Playwright in CI.
- `cashReservesTightMonths` 3 → 6.

## Approver

**2026-10-21 — Changes requested, then revised. This is a self-review**, at
the owner's standing instruction. It is not the independent review the repo's
`CLAUDE.md` describes and nobody should later take it for one. It checks facts
against code; it cannot judge whether the design is right, because the same
hand drew it.

### 1. The test coupling was pointed at the wrong file

Rev 1 said *"if `tests/19-crm.spec.ts` asserts any header string"* and left it
as a thing to check later. Wrong file, and it should not have been left.

`tests/19-crm.spec.ts` asserts none of it. **`tests/24-screen.spec.ts` asserts
four of these strings exactly**, and line 147 expects the literal `"No ARV"`
— the exact string §3 removes. Deferring that check to implementation time is
how a deliberate change becomes indistinguishable from a broken test at the
gate, which is precisely what the Stage A plan promised to avoid and then did
not. Now named, with the line number, in Testing.

### 2. The shared-component count was wrong

Rev 1: *"Four call sites (`PropertyDetailPage` ×3, `PropertiesPage`)."* It is
**six** — three and three. The blast radius on the properties list is three
times what the plan claimed.

### Verified as claimed

- `PropertyDetailPage.tsx:475` and `:484` do pass an identical hardcoded
  `toneClassName` to both verdict tags, so Works and Doesn't work really are
  the same colour today.
- `VerdictTag.tsx:137` is `text-[10px] uppercase tracking-wider`.
- `:323` is `row.deal.hasArv ? DEAL_LABEL[row.deal.verdict] : "No ARV"`.
- `:441` renders the asking price in `text-(--color-text-secondary)` at 12px.
- The facts grid does give Parcel the same weight as Beds/baths and Sqft.
- **Corrected from rev 1's draft:** `VerdictTag` is *not* hover-only. It
  carries an `onClick` beside its hover props, so the explanation opens on tap.
  An earlier reading of `cursor-help` suggested otherwise and was wrong.

**Recommendation: proceed.** Both findings are corrections to the plan's
account of its own reach, not to the design. The six faults it describes are
real and each is verified above.

**Not approval to start. The owner decides.**
