# Plan: the Properties page looks like houses

Status: **User approved (rev 3)** on 2026-10-23. Shown the rev 3 mockup and
asked about the layout, the library and the existing houses, the owner
replied "yes perfect". That is read as approving rev 3 as recommended:
leaflet, and backfill option A **written, not run**. The backfill still needs
its own "run the backfill". Stage 1 was **User approved** on 2026-10-23 ("Approved: Stage 1 as
written in plans/properties-design-change.md, option A. Reason-copy fix as the
next branch; Stage 2 later.") and is built and committed (`8e922f0`). Rev 3 is
the owner's change to that layout, and none of it is built.
Branch: `properties-design-change`, cut from `main` at `08679fa`. The name
skips the `feat/` prefix the rules ask for. It can be renamed before the first
commit if the owner wants.

Design system: **Park Hawkins Capital**
(https://claude.ai/artifact/AfFqeoXw92zbqvYSFpchrx), read 2026-10-23: the
`README.md`, `screens.md`, `status-and-verdicts.md`, `tokens.json`, and the
Button, EmptyState, Explain, SpecsBar, StatCard, StatusPill and VerdictCard
guidelines. Where the owner's reference screenshots and the system disagree,
**the system wins**, and each place this happens is listed in §What the
references lose.

## Rev 3: a row of houses over a map

The owner, after seeing Stage 1: *"I want side ways scroll so the houses need
to be in a row.. underneath the houses will be a map with the properties pin
point on the map."*

That changes the Stage 1 layout and brings the map forward from Stage 2, so
it comes back through review. It stays on this branch, because it is the same
page and nothing here is pushed yet.

### The layout, phone and desktop alike

```
Properties
Every house you're looking at. Tap one to see whether it works.
(All) (Finalists)                                   (Compare 2)
┌──────────┐ ┌──────────┐ ┌──────
│  photo   │ │  band    │ │  pho      ← one row, scrolls sideways, snaps to
│ ⟨Tight⟩  │ │ ⟨Thin⟩   │ │           a card; the next card peeks in so
│ $135,000 │ │ $100,000 │ │           the row reads as more than one house
│ 674 Whit…│ │ 1900 Win…│ │
└──────────┘ └──────────┘ └──────
╭─────────────────────────────────╮
│   map, dark tiles, one pin per  │   ← fills the rest of the screen
│   house with its asking price   │
│        ($135k)      ($100k)     │
╰─────────────────────────────────╯
```

- **The row and the map are linked.** When a card snaps into the middle, its pin
  is highlighted and the map pans to it. Tapping a pin scrolls the row to that
  card. Tapping a card still opens the house.
- **A card in the row is shorter than the Stage 1 card.** At 390px a full
  Stage 1 card is about 470px tall, which would push the map off the screen. A
  row card is about 280px wide, with a shorter photo (about 130px, or the
  band), both verdicts, price, address, and the spec line. **The reason line
  is clamped to two lines.** "Resale price not checked yet", Compare, and the
  steps count stay, compressed into one footer row. Nothing leaves the card
  that option A kept.
- **Desktop** works the same, with wider cards (about 340px) and a taller
  map. The Stage 1 grid goes away.
- **A house the map can't place** still shows in the row. A line above the
  map says how many are missing: *"2 houses aren't on the map yet. We place a
  house when it's added or its address changes."*

### Found while building (2026-10-23)

- **CartoDB's tiles are no longer keyless.** Without a key they carry an "API
  KEY REQUIRED" watermark. The owner supplied `CARTO_API_KEY` (already in
  `.env.local`). It is read on the server in `app/(shell)/properties/page.tsx`
  and added to the tile URLs as `?key=`, which is how Carto's basemap keys
  are meant to be used. So **signed-in users can see it** in the tile
  requests. Without the key, the map still works, with the watermark.
  **The key must also be set in Vercel**, which is the owner's step. Carto's
  free tier is 5 million tile requests a month and is described as for
  non-commercial use.
- **Leaflet's z-indexes go up to 1000**, so the map is wrapped in `isolate`.
  Otherwise its controls would paint over the bottom bar (the same trap as the
  house page's sheet).
- **The row card's footer** shows "2 of 4 steps", and the listing link is
  icon-only. "Steps done" and the word "Listing" didn't fit at 280px.

### Added at the owner's request (2026-10-23)

*"the 'no price' is the Sales price input value from the add a house form.. I
think it should be changed to listing price."* The same field had four names:
"Sales price" (Add), "Asking price" (Edit), "No asking price yet" (cards and
the company page), and "No price" (pins). All now say **listing price**,
through one constant, `NO_LISTING_PRICE_LABEL` in `lib/property/types.ts`.
This touches `AddPropertyPage.tsx`, `EditHouseForm.tsx` and
`CompanyDetailPage.tsx`, which are outside this plan's original scope. It is
labels only, and the column (`list_price`) and the data are unchanged.

### Three things the map needs: OWNER DECIDES

**1. A map library, which is a new dependency.**

| | Key | Cost | Dark tiles |
|---|---|---|---|
| **`leaflet` 1.9.4 + `react-leaflet` 5.0.0** (+ `@types/leaflet` for development) | no | free | **yes**, CartoDB "dark matter", with attribution shown |
| Mapbox / Google | yes | metered | yes |

**Recommended: leaflet.** `react-leaflet` 5 supports React 19, which this app is
on. About 45 KB gzipped, loaded only on this page, through
`next/dynamic` with `ssr: false` (Leaflet needs `window`; the pattern comes
from `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`). The app
sets no Content-Security-Policy, so the tiles load without config changes.

**Stack exception:** Leaflet ships its own stylesheet
(`leaflet/dist/leaflet.css`), and the map does not position correctly without
it. It is imported once, inside the map component. This is the one non-Tailwind
style, and only because the library requires it. The pins themselves are
Tailwind-styled HTML.

**2. Where a house's coordinates come from.** The US Census geocoder
(`geocoding.geo.census.gov/geocoder/locations/onelineaddress`) is free, needs
no key, and the app already calls the same service for county tax
(`lib/census/propertyTax.ts`). It runs on the server when a house is added
(including batch add) and when its address is edited. It costs **no RentCast
requests**. If the geocoder fails or finds no match, **the house still saves**.
It just isn't placed, and the line above the map counts it.

**3. The houses that already exist have no coordinates.** There are three ways
to handle them:

| Option | Writes to the live database? | Trade-off |
|---|---|---|
| **A, recommended:** a one-off fill script, written on this branch, **run only when the owner says "run the backfill"** | yes: `latitude`, `longitude` on each existing house, nothing else | one run and done; it lists the rows it will touch before writing |
| B: look them up every time the page loads, and never save them | no | about one second slower per load, and the Census service is asked the same thing every time |
| C: leave them off the map until each one is edited | no | the map starts empty for every house that exists today |

### Scope (rev 3)

| File | Change |
|---|---|
| `package.json`, lockfile | `leaflet`, `react-leaflet`, and `@types/leaflet` (dev), **on approval** |
| `components/properties/PropertiesPage.tsx` | The grid becomes the snapping row. The row card is the compact form of the Stage 1 card. Row and map selection are linked. |
| `components/properties/HouseMap.tsx`, **new** | The map: tiles, price pins, highlight, and tap-to-select. A new file because Leaflet has to load client-only through `next/dynamic`, which needs it in its own module. |
| `lib/census/geocode.ts`, **new** | Address → `{ latitude, longitude } \| null`. Kept apart from `propertyTax.ts` because that file does county tax rates; the two share only the host. |
| `lib/property/propertyService.ts` | Geocode on create, and on update when the address changes. A failure never blocks the save. |
| `lib/screen/screenRow.ts`, `screenService.ts` | `latitude`, `longitude` read and passed through to the row |
| `scripts/backfill-coordinates.ts`, **new**, only if option A | Lists, then fills, existing houses. **Not run** without the owner's word. |
| `tests/unit/geocode.test.ts`, **new** | Parsing the Census reply: a match, no match, a bad reply |
| `tests/unit/screenRow.test.ts` | Coordinates pass through |
| `tests/24-screen.spec.ts` | The journey: the row scrolls, tapping a pin selects its card, the 390px check |

### Risks (rev 3)

- **New dependencies**: three packages, named above. Tier 2, so they're only
  installed on approval.
- **The backfill writes production data.** It is written but not run, as the
  owner's no-production-writes rule requires, and the script prints the rows
  before changing any.
- **The geocoder is an outside service on the save path.** A timeout (5
  seconds) and a null result mean it can slow a save, but it can never fail
  one.
- **The Census geocoder misses some addresses**, such as new builds and rural
  routes. Those houses show in the row but not on the map, and the count says so.
- **The Stage 1 grid is replaced**, and its commit stays in history.
- **Map tiles come from CartoDB's free tier**, which asks for attribution and
  fair use. A personal tool with a handful of houses is well inside that.

### Approver (self-review, rev 3)

The same Claude that builds it wrote this review. **It is not independent.**

- **Every Tier 2 item is named**: three dependencies, a production write
  (backfill option A, not run), and one outside call on save.
- **Every new file has a reason**: the map must be its own module for
  `ssr: false`, the geocoder is a separate concern from tax rates, and the
  backfill is a one-off.
- **Design system**: the dark tiles keep the dark-only rule. Pins carry the
  price in `figure-sm` on `color-overlay`, the selected pin uses
  `color-accent`, and the attribution text is secondary, never tertiary. The
  row cards keep 44px targets.
- **Changed by this review**:
  - The first sketch kept the full Stage 1 card in the row. At 390px that left
    no room for the map, so the row card is compact.
  - The geocode-on-save path was changed so it can never block a save.

**Recommendation:** approve rev 3 with leaflet and backfill option A. The
backfill is run later, only on your word.

## The problem

Every card on Properties is a block of text: address, three tags, a reason, a
line of dashes, eight figures and four step buttons. On a phone two houses
fill the screen, and with no resale price yet most of those figures are `—`.
Nothing on the screen looks like a house.

The design system's own spec for this row (`screens.md` § Properties) is much
shorter than what ships:

| On the row | Says |
|---|---|
| address | — |
| asking price | the figure |
| the deal verdict | Works · Thin · Doesn't work, in its tone |
| one reason | *"4% profit, under the 10% floor"* |
| checked or not | *"Resale price not checked yet"* where it is provisional |

The owner sent five references:

- **Desktop**: a grid of photo cards on the left, a map on the right with a
  price pin per house, and tapping a pin opens a small card over the map.
- **Phone**: one card per row, made almost entirely of the photo, which fades
  into the card. Status sits on the fade, then the title and price, the
  address, and the specs. A heart and an open-arrow sit in the top corners.
  Filter pills run across the top. A second phone view shows the houses as
  pins on a map, with the selected house in a card along the bottom.

## What the references lose

Marketplace apps exist to make you want a house. This app tells you whether
the numbers work (`feat-house-sheet.md` made the same call).

| Reference | Here | Why |
|---|---|---|
| "For sale" + star rating | **The verdicts**, in their tone, each with its reason | `screens.md`: a row never shows a bare verdict |
| Heart | **Finalist star** (it already exists), 44px tap target | `tap-min` |
| Open-arrow ↗ on the photo | **Dropped.** The whole card opens the house | The system's icon table: an arrow out of a box means *leaves the app*, and only that. The listing link keeps it |
| Spec chips | **One spec line**, `3 bed · 2 bath · 1,200 sq ft` | The `label` style and the SpecsBar rule: the spec line is one line of short facts, with `color-text-tertiary` dots as punctuation |
| Agent name and phone | **Not copied** | There is no agent to call |
| Rent / Buy / Sell pills | **All / Finalists**, as `control-pill` (36px) inside a 44px target | Button rules: pills are the app's button shape |
| Light theme | **Not copied** | The system is dark only, and no component may assume a light mode |
| Very round cards | `radius-lg` | The system: `radius-lg` is the default card, `radius-xl` is for the review card and full-screen panels |
| Price-range bubbles on the map | Plain price pins | With fifteen houses there is nothing to group |

## Goal

The list reads as a set of houses at a glance, and each house still says
whether you can afford it and whether the deal works, with the reason. On a
laptop, you can see where the houses are (Stage 2).

## What the code gives us

All of this was checked on `main`:

1. **Photos are optional, hand-pasted links.** `photo_url` comes from Add and
   Edit, and nothing fetches one. The owner's own list (screenshot 1) shows
   **no photos on either house**. So the card without a photo is the common
   case, not an edge case.
2. **Beds, baths and sq ft are already loaded.** `ScreenHouse` carries them
   (`lib/screen/screenRow.ts`), but `ScreenRow` drops them. Passing them
   through takes three fields, with no new query.
3. **`row.price` is not the asking price.** It falls back to the calculator's
   $350,000 default. The big number on the card must be `row.listPrice`, and a
   house with none says **"No asking price yet"**.
4. **The system's tokens are only partly in the app.** `globals.css` has the
   colours, spacing, radii and shadows. It does **not** have the type scale
   (`figure`, `body-strong`, `label`, …), the `control` tokens (`tap-min`,
   `control-pill`) or the `color-tint-*` fills. The system says new tokens go
   into `globals.css` and the system in the same change, so the ones this card
   uses are added here (§Scope).
5. **No house has coordinates, and there is no map library.**
   `properties.latitude` and `longitude` exist, but nothing fills them. This is
   why the map is Stage 2.

## Stage 1: the cards (this branch)

No new dependency, no data change, no database write.

### The page

- **Opening sentence**, as `screens.md` words it: *"Every house you're looking
  at. Tap one to see whether it works."* The current sentence is longer and
  says the same thing.
- **The heading** uses the `heading` style (20px / 600).
- **Empty**, per EmptyState: title *"No houses yet"*, then *"Add the first
  one and we'll tell you what it's worth fixed up and whether the numbers
  work."*, then an **Add a house** button.
- **Finalists filter showing nothing**: EmptyState says a filter is not an
  empty state, so this shows a line (*"No finalists yet. Tap the star on a
  house to make it one."*) and a **Show all** button.

### The phone card (≤390px)

```
╭───────────────────────────────╮
│ [photo, full width, 4:3]    ☆  │  ☆ = finalist, 44px target
│                                │
│░░░░ fades into the card ░░░░░░│
│ ⟨Thin⟩ ⟨Tight⟩                 │  verdicts, sitting on the fade
│ $135,000                       │  asking price, `figure` (Syne 24/700)
│ 674 White Bird Way, Fairburn   │  `body-strong`
│ 3 bed · 2 bath · 1,200 sq ft   │  `label`, tertiary dots
│ 4% profit, under the 10% floor.│  the reason, `body`
│ Resale price not checked yet → │  only when it hasn't been checked
│ ─────────────────────────────  │
│ [Compare]   2 of 4 done  Listing ⧉│  pills, 36px in 44px targets
╰───────────────────────────────╯
```

- **The ground** is `color-surface`, since the system uses it for a plain card
  or row on the page. The photo's gradient fades into that same colour.
- **The photo** is full width at 4:3 with `object-cover`. A photo whose link
  is dead falls back to the no-photo band through `onError`, not a broken
  image.
- **No photo**: a 96px band in `color-elevated` with the `Home` icon, and the
  verdicts on its lower edge. The house page already handles a missing photo
  this way. A missing photo must not leave a large grey hole, because right now
  that is every house.
- **The verdicts sit on the fade**, where the photo has already turned into
  card colour. The tint fills stay legible there. They don't go higher on the
  photo, because a 10% tint over a photograph can't be read. They keep their
  tap-to-explain and their test ids.
- **Both verdicts are shown.** `screens.md` names only the deal verdict for
  this row. The app has two questions, though, and the system's own
  `status-and-verdicts.md` says *"both are always shown"*. The two disagree
  often enough that hiding one would mislead.
- **The "ARV / Review comps" tag goes.** The system bans *ARV* and *comp* in
  the interface (except behind a tap-to-explain), and the row's spec asks only
  for "checked or not". It becomes the line *"Resale price not checked yet"*,
  which links to that house's resale-price tab. When the price has been
  checked, the line isn't shown.
- **"2 of 4 done"** replaces the four step buttons. Tapping it opens the
  house on its next unfinished step.
- **Compare** becomes a toggle pill (`aria-pressed`) with `color-text-secondary`
  text. The system says tertiary text can't be read, and the current
  "Compare" label is tertiary.
- **The listing link** keeps `ExternalLink`, which is the one thing that icon
  means.

### What else leaves the card: OWNER DECIDES

The **eight-figure grid** and the **walk-away / true profit line** aren't in
the system's row spec, and the reference cards carry a price and three facts.

| Option | Card carries |
|---|---|
| **A, recommended** | Everything above and nothing more. The figures live on the house page and on Compare, where they're explained. |
| B | Everything above, plus **one money line**: *"Cash to close $13,400 · $1,569 a month"*, or after a resale price, the cheque you leave with and what you actually made, each with its Explain chip |
| C | Everything above, plus the full grid folded under a **See the numbers** toggle |

A follows the system exactly. B adds one more reason to open a house. C keeps
everything, behind a tap.

**Owner's choice, 2026-10-23: A**, after seeing the mockup ("card lean a, with
photo looks great"). B and C are not built.

### Desktop (≥1024px)

- Cards go into a grid: `lg:grid-cols-2`, then `2xl:grid-cols-3`. The photo
  caps at 220px tall so it doesn't turn into a poster.
- In Stage 1, **the map column is not there**, and the grid uses the full
  width. In Stage 2 the grid narrows to the left and the map sticks on the
  right.

## The reason line is already wrong: OWNER DECIDES

Both reasons in the owner's screenshot are on the system's list of copy that
is wrong:

- *"$600 left after closing — under 3 months of payments"*: `README.md` §2
  quotes this exact frame as the mistake. The payments come out of pay, not
  savings. The fix is *"…your cushion for surprises. Aim for six."*
- *"Combined LTV 100% leaves almost no equity"*: `status-and-verdicts.md`
  rewrites it as *"You'd own about 3% of it at the start. That's normal on
  this loan."* It also uses "LTV", which is jargon.

These lines come from `lib/mortgage/verdicts.ts` / `lib/deal/explainDeal.ts`,
not from the card. The house page shows them too, and `explainDeal.ts` already
has banned copy listed in the handoff. Fixing them changes every screen that
says them, which is beyond a Properties redesign.

**Recommendation: a separate `fix/` branch right after this one**, covering the
summaries and the `explainDeal.ts` lines together, each tested in Jest. The
card will be laid out for the right copy, and it will show the current copy
until then.

## Stage 2: the map (a later branch, after three decisions)

Listed so the whole design is visible. **None of it is built on this branch.**

1. **Library**: `leaflet` + `react-leaflet` with CartoDB's dark tiles. No key,
   no billing, and the tiles match a dark-only system. Same recommendation as
   `feat-house-sheet.md`, still undecided. **New dependency: OWNER DECIDES.**
2. **Where the coordinates come from**: the US Census geocoder
   (`geocoding.geo.census.gov/geocoder/locations/onelineaddress`). It is free,
   needs no key, and the app already calls the same service for county tax
   (`lib/census/propertyTax.ts`). It runs when a house is added or its
   address is edited, and costs no RentCast requests. **OWNER DECIDES.**
3. **Houses that already exist** have no coordinates. Filling them in writes
   to every property row in the live database. That is **the owner's call,
   run only on the owner's word**, with the rows listed first. Until then the
   map says *"We don't know where these houses are yet."* and gives a count. It
   is not an error.

Then the map: price pins, and tapping one opens that house's card over the
map. On a phone, a **List / Map** toggle sits beside the filter pills, with the
selected house as a card along the bottom.

## Scope (Stage 1)

| File | Change |
|---|---|
| `components/properties/PropertiesPage.tsx` | `ScreenCard` rebuilt as the photo card. Opening sentence, empty state and filter-empty line per the system. Filter pills restyled. Grid at `lg` and `2xl`. Skeleton matched to the new card. |
| `app/globals.css` | Adds the system tokens this card uses and the app lacks: `--tap-min`, `--control-pill`, and the type styles `heading`, `body`, `body-strong`, `label`, `figure` (size and line-height each), with values exactly as in the system's `tokens.json`. **Adds only. Nothing existing changes.** |
| `lib/screen/screenRow.ts` | `ScreenRow` gains `beds`, `baths`, `sqft`, passed through from `ScreenHouse` |
| `lib/screen/specLine.ts`, **new** | One pure function: house → `["3 bed", "2 bath", "1,200 sq ft"]`, so singulars, missing values and formatting are tested once. A new file because nothing existing formats specs for a list. The house page builds its own three inline at `PropertyDetailPage.tsx:546`, so it moves to this function and the logic lives in one place. |
| `components/crm/PropertyDetailPage.tsx` | Uses `specLine`. **No visual change.** |
| `tests/unit/specLine.test.ts`, **new** | The Jest cases |
| `tests/unit/screenRow.test.ts` | Beds, baths and sq ft pass through |
| `tests/24-screen.spec.ts` | Updated to the new card. See Risks. |

The card stays inside `PropertiesPage.tsx`, to keep new files to a minimum.

## Approach

1. Run `24-screen.spec.ts` as it stands and record what already fails.
2. Add the tokens to `globals.css`.
3. Pass `beds`, `baths`, `sqft` through `ScreenRow`, with the Jest test.
4. Add `specLine`, with tests, and point the house page at it.
5. Rebuild `ScreenCard`, plus the money line if the owner picks B or C.
6. Opening sentence, empty states, filter pills, the grid, the skeleton.
7. Update `24-screen.spec.ts` and run it, including the 390px check.
8. `npx tsc --noEmit`, `npm run lint`, `npm run build`.
9. Look at it at 390px and at 1440px, with a photo, without one, and with a
   dead photo link, and screenshot each.

Roughly one commit per step.

## Risks

- **`24-screen.spec.ts` asserts the old card.** "The figures that drive the
  verdicts are on the row" (line 131), the "Review comps" / ARV tag tests
  (lines 156–170) and the checklist tests (lines 199–221) check things this
  design removes or rewords on purpose. That is changing what the tests
  expect, **not weakening a failing test**, but the owner should see it named.
  Every changed assertion goes in the hand-off.
- **Some of those checklist tests may already be out of date.** They name
  `checklist-visit`, `-estimate` and `-comps`, but the card's steps are now
  Details / ARV / Numbers / Deal. Step 1 runs the spec before anything is
  touched. Anything that already fails is reported as found, not quietly
  fixed.
- **`23-comps.spec.ts` can't be run on its own** (see the handoff). Not
  touched.
- **The reason line keeps its wrong copy until the follow-up branch.** It is
  named above rather than hidden.
- **The design system still lists Pipeline**, which was removed in #65. That
  goes to the owner as a note. This branch doesn't edit the system.
- **No Tier 2 action in Stage 1**: no dependency, no migration, no data write.
  `globals.css` gets new tokens only, and the system asks for exactly that.

## Testing

- **Jest**: spec line (singular and plural, missing values, sq ft with commas,
  a house with nothing), and the `ScreenRow` pass-through.
- **Playwright**: `24-screen.spec.ts` updated, with one journey (the list
  loads, a card shows price, specs, both verdicts with their reason, and
  tapping it opens the house) and the 390px layout check, including that every
  control on the card is at least 44px tall.
- **By eye at 390px and 1440px**, with screenshots in the hand-off: a house
  with a photo, one without, and one with a dead photo link.

## Out of scope

- The map, the List / Map toggle, the geocoder and any coordinate backfill:
  Stage 2.
- The wrong reason copy: the follow-up `fix/` branch.
- Shared-house badges (`TeamShare`): there are no team screens yet.
- `VerdictTag`'s own colours. They use Tailwind's amber and red, not the
  system's `color-tint-*`. They're used on other screens, so they get their
  own change.
- Fetching photos automatically. The house page. Compare.

## Approver (self-review)

At the owner's standing instruction, this review is written by the same
Claude that will build the plan. **It is not an independent review.**

- **Scope**: every file is named. Two new files are named, and both have a
  reason. `globals.css` is named, and it only gains tokens.
- **Stack**: TypeScript and Tailwind. Tokens are read with the `(--token)`
  syntax, as the system's §9 shows. No new dependency in Stage 1.
- **Refactor first**: the card is rebuilt in place. Spec formatting moves into
  one shared function rather than being written a second time.
- **Tier 2**: none in Stage 1. Stage 2's three items are marked OWNER DECIDES.
- **Against the design system**: the opening sentence, the empty state, the
  filter-empty line, the 44px targets, pills as the button shape, `radius-lg`,
  `color-surface`, the type styles, the icon meanings, the ban on ARV and
  comp, and tertiary text kept off readable words are all followed. It departs
  in one place: both verdicts on the row, not only the deal verdict. The
  reason is above, and it comes from the system's own verdict rules.
- **Changed by this review**:
  - **Rev 1** used `row.price` (the calculator default) for the headline.
    Switched to `listPrice`.
  - **Rev 2**, after reading the system:
    - The ↗ on the photo would have meant "leaves the app", so it was dropped.
    - The spec chips became a spec line.
    - The "Review comps / ARV" tag became "Resale price not checked yet".
    - The opening sentence and empty state now match `screens.md`.
    - The money line moved from "recommended" to option B, since the system's
      row spec doesn't include one.
    - The wrong reason copy was found and split out.

**Recommendation:** approve Stage 1 with option A, and the reason-copy fix as
the next branch. Decide Stage 2's three questions separately; Stage 1 doesn't
depend on them.
