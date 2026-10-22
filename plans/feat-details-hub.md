# Plan: Details becomes the way in

Status: **Revised (rev 2)** — 2026-10-22, after a self-review. Awaiting the owner. No code written.
Branch: `feat/details-hub` — **not cut.** `feat/house-header` is unmerged, and
one branch at a time means this starts from main after that lands.
RentCast requests: **0**. Every figure here is already on the page.
Design system: https://claude.ai/artifact/AfFqeoXw92zbqvYSFpchrx — `screens.md`.

## The problem

A house has six tabs — Details · ARV · Numbers · Deal · Rehab · Activity — and
no way to see where it stands without opening each one. The owner's words:
*"a quick look of each section. What's the supposed ARV? What is the deal?
What is the rehab calculation? What's the numbers looking like?"*

Details is the natural place and it is nearly empty: every fact it used to
hold — beds, baths, size, year, type, parcel — moved onto the house card in
`feat/house-header`. **It holds Contacts and nothing else.**

## Goal

Open a house, land on Details, and know in one screen where it stands and what
to do next — without opening a single other tab.

## Stack

TypeScript strict, Tailwind utilities, tokens from `globals.css`. No new
dependencies, no new data. Read `node_modules/next/dist/docs/` before
component work — Next 16.2.4, React 19.2.4.

## Approach

### The shape

Two verdicts across the top, then a grid of tiles, then Contacts where it
already is.

```
Can we afford it?        Does the deal work?
Tight                    No resale price yet

┌──────────────────────┬──────────────────────┐
│ Worth fixed up?      │ The numbers          │
│ Not checked yet      │ $1,247 a month       │
│ 72 houses to go    → │ $12,000 to close   → │
├──────────────────────┼──────────────────────┤
│ The deal             │ The work             │
│ No resale price yet  │ $48,000 budgeted     │
│ Check houses nearby→ │ From your default  → │
├──────────────────────┴──────────────────────┤
│ What's happening                            │
│ 2 tasks open · 1 overdue                  → │
└─────────────────────────────────────────────┘
```

### A tile, exactly

Three lines, in this order, and the order is the point:

1. **What it is**, as a question or a plain noun — never a tab name.
2. **Where it stands** — the figure, or the state in words.
3. **What's next** — one line, and it is the thing that makes the tile worth
   tapping rather than reading.

A tile with nothing to say yet says so and offers the first step:
*"Not checked yet · 72 houses to go"*. **No tile is ever blank and no tile
shows a dash.** The whole tile is the tap target, minimum `tap-min`.

**Before the figures arrive, and if they never do.** `row` is
`ScreenRow | null`: it lands a round trip after the house itself, and a failed
screen request leaves it null for good. The page already has `screenLoaded`
and a `Skeleton` for exactly this, and the hub uses both:

- **Loading** — each tile holds its own height with a skeleton line, so the
  grid does not grow under a thumb already reaching for it.
- **Loaded, no row** — the tiles that need `row` say *"Couldn't work the
  numbers out — open it and we'll try again"* and still link through. A tile
  that vanishes on a failed request is a tile the owner thinks they imagined.
- The rehab and activity tiles **do not read `row`** and render either way.

### Where every figure comes from

Nothing is computed here. Each is already on the page by the time Details
renders, which is why this adds no request and no RentCast call.

| Tile | Reads | Goes to |
|---|---|---|
| Can we afford it? | `row.affordability`, `row.explanations.afford` | Deal |
| Does the deal work? | `row.deal`, `row.explanations.deal` | Deal |
| Worth fixed up? | `row.arv`, `row.approvedComps`, `row.compsToReview` | ARV |
| The numbers | `row.piti`, `row.cashToClose` | Numbers |
| The deal | `row.profit`, `row.marginPct` | Deal |
| The work | `resolveRehab(null, primaryBudget)` — already imported at `:44` | Rehab |
| What's happening | `detail.tasks`, `detail.activities` | Activity |

**The two verdicts reuse `VerdictTag`** at `size="answer"`, with the same tone
maps the card and the properties list use. One definition of what a verdict
looks like, which is what `feat/house-header` established.

### Words

Tab names are for the tab bar. A tile says what it is in the owner's words:

| Tab | Tile reads |
|---|---|
| ARV | Worth fixed up? |
| Numbers | The numbers |
| Deal | The deal |
| Rehab | The work |
| Activity | What's happening |

No "ARV", no "comps". `screens.md` already fixed this wording for the tabs
themselves; this follows it.

### What the card keeps

**Open question for the owner, and the plan does not assume it:** the house
card still carries the two verdicts. With Details answering the same two
questions in more room, the card could drop them and become pure identity —
photo, price, address, specs, parcel.

Two readings, both defensible: a verdict on the card is seen without a tap;
the same verdict in two places is the duplication this header has already been
burned by three times today. **Not decided here.**

## Scope

| File | Change |
|---|---|
| `components/crm/PropertyDetailPage.tsx` | the Details panel, `:858-872` |
| `components/crm/DetailsHub.tsx` | **new** — the tiles |
| `tests/unit/detailsHub.test.ts` | **new** — what each tile says |

**New files, and why no existing one fits:** `PropertyDetailPage.tsx` is
already over a thousand lines and holds six panels; the hub is the seventh and
the largest. The pure "what does this tile say" functions go in their own test
file because `arv.test.ts` is about the ARV and this is not.

**Not touched:** `ContactCard`, the tab bar, every other panel, and every
figure's source. This adds a reader, not a calculation.

## Refactors

- `VerdictTag`, `AFFORDABILITY_STYLE`, `DEAL_STYLE`, `UNJUDGED_STYLE` reused as
  they are.
- `resolveRehab` is already imported by the page; the tile reads the same call,
  not a second one.
- The tile's wording functions are **pure and exported**, so what a tile says
  is a Jest test and not a browser one. This follows `CLAUDE.md` §Testing:
  *"label and copy mapping ... is a unit test against the function."*

## Risks

- **One new component file and one new test file.** Justified above.
- **Details gains a reason to be the default tab.** It is not one today and
  this plan does not make it one — that is a separate decision with its own
  consequences for anyone deep-linking to a tab.
- Nothing touches auth, RLS, env, CI, lockfiles, migrations, or Plaid.
- **No migration. No database change. No new request.**

## Testing

**Jest** — the wording functions, which is where everything here can be wrong:

1. an unchecked house says "Not checked yet" and how many are left
2. a checked house says the figure and how many it came from
3. the numbers tile says the monthly payment and the cash to close
4. the deal tile says profit and what it is a percentage of
5. the rehab tile distinguishes a budget from an estimate, and says which
6. a house with no tasks says so rather than showing a zero
7. no tile ever returns an empty string or a bare dash

**Playwright** — one journey test, because a hub is wiring and wiring is what
a browser proves: Details renders its tiles, and tapping one lands on that
tab. Plus the 390px layout check. This is a major feature by §Testing's
measure, which is why it gets one; the house-header redesign did not and
correctly got none.

**OWNER:** the Playwright job is still commented out in `.github/workflows/ci.yml`,
so that test runs only by hand until it is re-enabled.

**Gate:** `npm run build`, `tsc --noEmit`, `npm run test:unit`, and looked at
at 390px — four tiles two-up on a phone is exactly where this wraps badly.

## Out of scope

- **Editing the card in place.** The owner's other request, and its own plan:
  it rewires a working form rather than adding a reader.
- Making Details the default tab.
- The Deal tab's verdict levers.
- Re-enabling Playwright in CI.

## Approver

**2026-10-22 — Proceed, with one change made.**

**This is a self-review**, at the owner's standing instruction. It is not the
independent review `CLAUDE.md` describes and should not later be read as one.
It checks facts against code; it cannot judge whether a hub is the right idea,
because the same hand drew it.

### The one gap, now fixed in the body

Rev 1 said *"no tile is ever blank"* and then never said what a tile shows
while `row` is null — which it is on every first paint, and stays if the
screen request fails. Five of the seven tiles read `row`. Without an answer
the grid either renders empty cells or pops into existence a round trip late,
under a thumb already moving.

The page solved this for the card with `screenLoaded` and `Skeleton`. The hub
uses the same two, and a failed load says so rather than hiding — written into
Approach.

### Verified against the code

- `PropertyDetailPage.tsx` is **1,075 lines** and holds six panels. The
  new-file argument holds.
- `primaryBudget` is in component scope at `:202`, so the rehab tile reads the
  same value `RehabPanel` does rather than recomputing it.
- `ScreenRow` really does carry `piti` (`:92`), `cashToClose` (`:94`) and
  `marginPct` (`:102`), plus the affordability, deal, arv and comp counts the
  table claims.
- The Details panel is Contacts and nothing else (`:858-872`). Rev 1's earlier
  claim in conversation that Details was *empty* was wrong; the plan says
  Contacts, which is right, and Contacts stays where it is.
- `resolveRehab` is imported at `:44` and already called at `:816`.

### Judged, not just checked

- **One Playwright journey test is correct here** where the house-header
  redesign correctly had none. A hub is wiring — tiles rendering, a tap
  landing on the right tab — and wiring is the thing only a browser proves.
  The wording lives in Jest, which is what §Testing asks for.
- **Leaving the card's verdicts undecided is right.** It is a real choice with
  an argument each way, and a plan that quietly picks one is how the same fact
  ends up worded two ways in two places.

**Recommendation: proceed.** The gap above is closed. Nothing else in the plan
overstates its reach.

**Not approval to start. The owner decides.**
