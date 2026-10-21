# Plan: the ARV is built from comps you approved

Status: **Draft** — waiting for approval. No code written for this design.
Branch: `fix/comp-controls` (already cut from main; nothing committed on it).
RentCast requests: **0**.

## The problem

The ARV moved four times without the owner touching anything: 290 → 260 →
250 → 219. Every move was defensible on its own — a filter widened, a
duplicate dropped, a rule narrowed — and that is exactly the problem. A
valuation that rewrites itself each time the code changes is a number nobody
can stand behind, and no amount of better filtering fixes it, because the
filtering *is* the thing moving it.

So the app stops deciding. It pulls comps, shows what it noticed, and waits.

## What this replaces

Supersedes the tick-based design in flight on this branch. Of the five items
agreed earlier:

| Earlier item | Now |
|---|---|
| 1. Nominal transfers start unticked | **Hint only.** Never changes a state. |
| 2. Fixer flag narrowed | **Kept**, as a hint. The narrowing stands: never flag at or above the approved median. |
| 3. Tick means counted, + untick-failing data fix | **Dropped.** Replaced by review states; the data fix becomes "set everything to Needs review". |
| 4. No flag on comps that aren't counted | **Kept** — no hints on skipped comps. |
| 5. Sort and filter | **Kept**, as dropdowns. Tick-all / untick-all buttons **removed**. |

`plans/feat-comp-outcomes.md` (on hold) stays on hold. It asked a different
question — *what happened to this listing* — and this plan asks *should it
count*. They can coexist later; neither needs the other now.

## The review state

Every comp carries exactly one, and it is the only thing the ARV reads.

| Stored | On screen | Counts? |
|---|---|---|
| `needs_review` | Needs review | no |
| `renovated_use` | Renovated: use it | **yes** |
| `not_renovated_skip` | Not renovated: skip | no |
| `not_comparable_skip` | Not comparable: skip | no |

The two skips behave identically in the arithmetic. They are kept apart
because they record different judgements, and in six months "why isn't this
one in?" has two different answers.

### Migration — written, NOT run

```sql
ALTER TABLE property_comps
  ADD COLUMN IF NOT EXISTS review text NOT NULL DEFAULT 'needs_review'
    CHECK (review IN ('needs_review','renovated_use','not_renovated_skip','not_comparable_skip')),
  ADD COLUMN IF NOT EXISTS review_set_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS review_set_at timestamptz;

-- Any state other than the default was set by a person.
ALTER TABLE property_comps ADD CONSTRAINT property_comps_review_has_reviewer
  CHECK (review = 'needs_review' OR review_set_by IS NOT NULL);
```

`DEFAULT 'needs_review'` means a comp inserted by a refresh arrives unreviewed
with no extra code, which is requirement 6.

**`included` is left in place and stops being read.** Not dropped: dropping a
column is irreversible and it currently holds the only record of what was
ticked. It becomes dead weight the day this ships, and removing it is a
separate decision once you are sure you don't want that history back.

## The ARV

- Basis: comps with `review = 'renovated_use'` that have a price and a size.
  Nothing else enters, and nothing is removed by any rule.
- **No filter excludes anything any more.** Eligibility, duplicates and
  nominal transfers produce text, never decisions.
- With no approved comps the value is `null` and the card reads
  **"Review comps to get an ARV"** rather than showing a number.
- `basisLabel` becomes **"Based on 4 comps you approved · 77 still to
  review"**.

Two consequences worth seeing before you approve:

**Approving both copies of a duplicate double-counts that house.** The hint
("same house listed twice") is the only guard, by design — item 5 says hints
never count anything. If you would rather duplicates stay excluded even when
approved, say so; it is a one-line change but it is the app deciding again.

**Every house reads "Review comps to get an ARV" the moment this ships**,
until you review something. That includes Sylvan Rd. That is requirement 8
working as intended, but it is a blank screen where a number used to be.

### Hints, which never do anything

Shown on the card, exactly as now: *much bigger*, *1.2 mi away*, *2 more
bathrooms*, *built 2003, 73 years newer*, *same house listed twice*, *likely
a paperwork transfer, not a real sale ($1,000)*, *possibly a fixer-upper*.

Hints are suppressed on a skipped comp — a warning about a comp you already
decided against is noise about a settled question.

**One carve-out to confirm:** "Similar homes nearby" still leaves out a
paperwork transfer even if approved, because "$1,000–$462,000" describes no
street that exists and that line is read by eye as a sanity check. The ARV
itself would still include it. You asked for this twice, so I have kept it —
but it is the one place a hint still changes something, and it is a display,
not the number.

## On screen

**The card.** The include checkbox is replaced by the Review dropdown — one
decision, one control. Native `<select>`, which is the right thing on a
phone. Everything else on the card stays.

**Controls above the list**, two dropdowns, no buttons:

- **Show** — defaults to **Needs review** (requirement 7). Then: Approved ·
  Skipped · All · Sold · Listings · Flagged. Each option carries its count:
  "Needs review · 77".
- **Sort** — Closest first (default) · Most recent sale · Price high to low ·
  Price low to high · Size closest to this house.

**The list scrolls** inside a max height rather than running the page to
eighty cards, with the ARV card staying visible above it.

**Header**: "Showing 77 of 81".

Sorting and filtering never change the ARV. Only a review does.

Empty filter result says which filter is hiding things and offers "Show all".

390px: controls wrap to two lines, no sideways scroll, 44px tap targets.

## Existing data (requirement 8)

`scripts/review-reset.ts`, dry-run by default, `--write` to apply:

- sets every existing comp to `needs_review`
- prints each house's before and after ARV — every "after" will be
  "Review comps to get an ARV"

**Read-only first. I will show you the output and wait before writing.**

## Open questions

1. **Hand-entered comps.** A comp you typed in yourself from an agent's list
   — does it arrive `needs_review` like the rest, or `renovated_use` since
   you entered it deliberately? I lean toward `renovated_use`: you already
   made the judgement by typing it.
2. **Duplicates when both are approved** — see above.
3. **Confidence wording.** It reads off the comp count (5 for "moderate", 8
   for "good"). With manual review most houses will sit at "low" for a long
   time. Keep as is, or re-scale?

## Testing

**Unit** — only `renovated_use` counts; each other state does not; no
approved comps gives a null value and the review prompt; the basis label
counts both approved and remaining; hints appear on unreviewed comps and are
suppressed on skipped ones; a refresh leaves an existing review untouched;
the nominal transfer stays out of the nearby range while counting in the ARV.

**Playwright, 390px** — the Show dropdown defaults to Needs review; changing
review to "Renovated: use it" moves the ARV; the two skips do not; sorting
changes order and not the ARV; the list scrolls inside its max height; no
sideways scroll; tap targets ≥44px.

## Risks

- **Migration.** Written, not run. Needs its own instruction.
- **Every ARV goes blank** until reviewed.
- **`included` becomes dead** but is deliberately not dropped.
- **Removing the checkbox** is a UI deletion, replacing one control with its
  successor rather than losing a capability.
- `database.types.ts` cannot be regenerated until the migration runs, so the
  service and UI work does not typecheck until then — the same sequencing
  problem as last time, and the same answer: I stop and ask.

## What happens to the uncommitted work

Nothing is committed on this branch. The working tree currently holds the
tick-based design. Keeping: the narrowed fixer rule, the nominal-transfer
detector, `assessComps` (demoted to a hint producer), the sort/filter
component minus its buttons. Discarding: tick-means-counted in
`calculateArv`, and `scripts/untick-failing-comps.ts`.

I will not discard anything until this plan is approved.

## Done when

A freshly pulled house shows every comp as Needs review and no ARV. Marking
four comps "Renovated: use it" produces an ARV from those four and says
"Based on 4 comps you approved · 77 still to review". A refresh changes no
review. Hints appear and change nothing. Checked at 390px. `tsc`,
`npm run build`, unit tests and the Playwright spec all pass.
