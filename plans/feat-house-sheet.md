# Plan: the house behind, the work in front

Status: **User approved (rev 3)** — 2026-10-22. **Stage 1 only.** Stage 2 is
held: its premise was found wrong by the self-review and the question that
replaces it has not been decided. No code written yet.
Branch: `feat/house-sheet` — **not cut.** `feat/details-hub` is unmerged with
three commits, and one branch at a time means this starts from main after that
lands. That is the only thing blocking a start.
RentCast requests: **0 extra.** See §4 — the map's coordinates come back on a
call the app already makes.

## The problem

The house page is a card, then a tab bar, then a panel, stacked down a column.
It works. It does not feel like the thing it is: a house you are standing in
front of, with a decision attached.

The owner's reference is the **48 Oak Street** layout — the photo filling the
top of the screen, and everything else in a panel that rides up over it with
rounded corners and scrolls independently. The photo stays; the work moves.

Worth naming what is *not* being copied, because three of the four references
are marketplace apps and their job is the opposite of this one's. They exist to
make you want a house. This exists to tell you whether the numbers work. No
"Rent Now", no agent to call about a listing, no browsing.

## Goal

Open a house and see the house. Scroll, and the work comes up to meet you
without the photo going anywhere.

## Stack

TypeScript strict, Tailwind utilities, tokens from `globals.css`. Read
`node_modules/next/dist/docs/` before component work — Next 16.2.4, React
19.2.4. **One new dependency, in stage 2 only — see §4.**

## Stage 1 — the sheet

No new data, no dependency. Ships on its own.

### The shape

```
┌─────────────────────────┐
│  ←                  ☆ ✎ │   hero, full bleed
│                         │
│      [ the house ]      │
│                         │
│  $149,900 · asking      │   over the photo, bottom-left
│  1653 Sylvan Rd SW      │
│  ⬛ 3 bed ⬛ 2 bath ⬛ 1,200 │   specs as chips on the photo
├─────────────────────────┤
│ ╭───────────────────╮   │
│ │        ▔▔▔        │   │   sheet, rounded top, a handle
│ │ Details ARV Numbers│   │   the tab bar rides at its top
│ │                   │   │
│ │  (the panel)      │   │   scrolls inside the sheet
```

- **The hero is `sticky top-0`**, so it stays put while the sheet scrolls over
  it. Not `fixed`: fixed takes the element out of flow and the sheet then has
  to know the hero's height, which is a number that goes stale the moment the
  photo's aspect changes.
- **The sheet is the scrolling element**, with `rounded-t-(--radius-xl)` and a
  grab handle. It starts overlapping the hero by one radius so the corners cut
  into the photo rather than sitting below it.
- **The tab bar moves to the top of the sheet** and sticks there. It is how you
  move between panels and it should not scroll away.
- **Price, address and specs move onto the photo**, bottom-left, over a bottom
  gradient. That is the reference's move and it buys back the vertical space
  this card has been fighting for all day.
- **Back, Finalist and Edit stay on the corners**, where they already are.

### What happens to the card

The card built in `feat/house-header` **becomes the hero**. Its content does
not change — photo, price, address, specs, and the parcel line. It stops being
a bordered box on a page and starts being the top of the screen.

Its verdicts stay where `feat/details-hub` put them: in the hub, inside the
sheet. Nothing is said twice.

### No photo

The hero collapses to a short band in `--color-surface` carrying the price,
address and specs, with the same line it has now. The sheet behaves
identically. A house without a photo is not a broken layout.

### Desktop

The app is built for 390px and checked there, but the page is reachable on a
laptop. Above `lg` the hero caps at **420px tall** and the sheet does not
overlap it — a photo half a screen tall on a 27-inch monitor is a poster, not
a header.

## Stage 2 — the map

### The coordinates are already paid for

`properties.latitude` and `properties.longitude` exist in the live schema and
`propertyService` already writes them (`:150`). **Nothing ever supplies them**:
the add form does not collect them, and `mapSubjectFacts` does not map them.

`RentCastSubjectProperty` carries `latitude` and `longitude`
(`lib/rentcast/types.ts:100-101`) on the AVM response the app **already
fetches for every house**, so the data is paid for and thrown away.

**But the function that would carry it is dead code.** `mapSubjectFacts` is
defined in `fromRentCast.ts` and called from exactly one place:
`tests/unit/arv.test.ts`. **No application code calls it at all.** Rev 1 said
"two more lines in `mapSubjectFacts`" and that would change nothing — the
mapped facts have nowhere to go, because nothing asks for them.

So stage 2 is larger than rev 1 claimed. It is three things, not one:

1. Add `latitude` and `longitude` to `MappedSubjectFacts` and map them.
2. **Wire `mapSubjectFacts` into the comps refresh**, so the subject's facts
   are persisted at all. This touches the comps path, which has shipped twice
   this week, and it means deciding what happens when RentCast's facts
   disagree with facts the owner typed — `facts_source` is `'manual'` on
   anything hand-set (`propertyService:370`), and a sync must not silently
   overwrite a figure somebody entered on purpose.
3. Then the map.

**Item 2 is the real work and it is not a map feature.** It deserves its own
decision, and possibly its own branch: "the app stores the subject facts
RentCast already sent" is a sentence about data, not about layout.

**A house refreshed before this ships has no coordinates**, and will not until
its next refresh — which costs one of fifty monthly requests. So the map needs
an honest empty state: *"We don't know where this one is yet. Refresh the
houses nearby and we'll place it."* It is not an error and must not look like
one.

### The library — OWNER DECIDES

A new dependency, which `CLAUDE.md` says to ask about first.

| Option | Key? | Cost | Fits a dark app? |
|---|---|---|---|
| `leaflet` + `react-leaflet` with CartoDB dark tiles | no | free | **yes** |
| OpenStreetMap `<iframe>` embed | no | free | no — light only, unstyleable |
| Mapbox / Google | yes | metered | yes |

**Recommendation: `leaflet` + `react-leaflet`.** No key, no billing, and
CartoDB's dark tiles are free with attribution, so the map matches the app
rather than punching a white hole in it. Roughly 45 KB gzipped, loaded only on
the house page.

The iframe is the honest zero-dependency answer and it is listed because it is
real — but it is light-themed and cannot be changed, which on this app is
worse than no map.

## Scope

**Stage 1**

| File | Change |
|---|---|
| `components/crm/PropertyDetailPage.tsx` | the hero, the sheet, the tab bar's position |
| `app/globals.css` | nothing — `radius-xl` and the tokens exist |

**Stage 2**

| File | Change |
|---|---|
| `lib/comps/fromRentCast.ts` | map `latitude` and `longitude` in `mapSubjectFacts` |
| `lib/comps/types.ts` | `MappedSubjectFacts` gains the two fields |
| `components/crm/HouseMap.tsx` | **new** — the map and its empty state |
| `package.json` | **new dependency**, on the owner's word |
| `tests/unit/fromPropertyRecords.test.ts` | the two fields are mapped |

**Not touched:** every panel, the hub, the comps work, and every figure's
source. Stage 1 moves things; it does not compute anything.

## Risks

- **Stage 1 rewrites the page's outermost layout**, which is the part every
  panel renders inside. A panel that assumed page scroll now scrolls inside
  the sheet — `CompsPanel`'s `max-h-[60vh]` list is the one to check first.
- **Position: sticky fails silently** inside any ancestor with `overflow:
  hidden` or `overflow: auto`. The shell wraps this page; that ancestor chain
  needs reading before the hero is built, not after it misbehaves.
- **A new dependency**, stage 2, on the owner's explicit word.
- **A house with no coordinates** is the normal case on day one, not the edge.
- No migration. No database change. No auth, RLS, env, CI or Plaid path.

## Testing

**Jest** — stage 2's mapping: latitude and longitude are carried through,
absent ones stay absent, and a zero is a coordinate rather than a missing one.

**Playwright** — one journey test plus its 390px check. The sheet is layout
and layout is what only a browser proves: the hero stays while the sheet
scrolls, the tab bar stays reachable, nothing overflows at 390px. This is a
major change to the page by §Testing's measure.

**Gate:** `npm run build`, `tsc --noEmit`, `npm run test:unit`, and **looked
at at 390px** — a sticky hero with a scrolling sheet over it is the single
most likely thing in this plan to be subtly wrong on a phone.

## Out of scope

- A photo gallery. A house has one `photo_url`; a gallery is a new table.
- The properties list, and the split list-and-map from the fourth reference.
- Editing the card in place — still its own plan, still unwritten.
- Re-enabling Playwright in CI.

## Approver

**2026-10-22 — Stage 1 proceed. Stage 2 changes requested.**

**This is a self-review**, at the owner's standing instruction, and not the
independent review `CLAUDE.md` describes. It checks facts against code; it
cannot judge whether the layout is the right one, because the same hand chose
it.

### 1. BLOCKING for stage 2 — the premise was wrong

Rev 1: *"Two more lines in `mapSubjectFacts` and every house gets its
position."*

`mapSubjectFacts` has **no callers in application code**. It is referenced
five times in `tests/unit/arv.test.ts` and nowhere else. Adding fields to it
would persist nothing.

Getting a coordinate onto a house therefore means wiring that function into
the refresh path and deciding how RentCast's facts interact with hand-entered
ones — a data question wearing a map's clothes. Rewritten in §4; it may want
its own branch entirely.

### 2. Stage 1's sticky worry resolves better than rev 1 feared

Rev 1 warned that `position: sticky` fails inside an `overflow: hidden`
ancestor and told the implementer to read the chain. Read:

- `AppShell:96` — `<main className="... overflow-hidden ...">`
- `PropertyDetailPage:360` — `<div className="overflow-y-auto flex-1 w-full px-4 py-4 pb-24 ...">`

**The page already scrolls in its own container**, inside that hidden main. A
sticky hero sticks to the top of *that* box, which is exactly the wanted
behaviour, and the hidden ancestor sits outside the scroll and does not
interfere. Stage 1's central mechanism works.

### 3. Stage 1 gap — the hero cannot go full bleed where rev 1 puts it

That same scroll container carries `px-4` (and `lg:px-8`). A hero rendered
inside it is inset by 16px on each side, which is not what "full bleed" means
and not what the reference looks like. It needs `-mx-4 lg:-mx-8`, or to be
hoisted out of the padded box — **rev 1 says neither**, and this is the kind
of thing that gets discovered as "why is there a gap down the side".

### 4. Stage 1 gap — nested scrolling, already named but understated

`CompsPanel` renders its list at `max-h-[60vh] overflow-y-auto`. Inside a
sheet that is itself the scrolling element, that is a scroll area within a
scroll area on a phone — the pattern where a thumb swipes the inner list and
the outer sheet refuses to move. Rev 1 lists it as "the one to check first";
it is more than a check, it is a decision: the comps list probably stops
capping its height once the sheet owns the scrolling.

### Verified as claimed

- `properties.latitude` and `longitude` are in the live generated types, and
  `propertyService:150` writes them.
- Nothing supplies them: the add form does not collect them and no mapper
  sets them. Null on every house today, as claimed.
- `RentCastSubjectProperty.latitude` and `.longitude` exist at
  `lib/rentcast/types.ts:100-101`.
- `pb-24` on the scroll container is the bottom-bar clearance, so a sheet
  layout inherits it rather than needing its own.

**Recommendation: build stage 1, with items 3 and 4 answered first. Hold stage
2** until the owner decides whether "persist the subject facts RentCast
already sends" is this branch's job or its own.

**Not approval to start. The owner decides, and the new dependency in stage 2
needs its own word.**


## Rev 3 — 2026-10-22

**Approved by the owner**, who said to continue. Recorded here as covering
stage 1 as written below plus the two resolutions in this section. It does not
cover stage 2, which stays held, and it does not cover pushing, opening a PR,
or merging anything.

### Gap 3 resolved — how the hero escapes the padding

The scroll container is one element, `PropertyDetailPage:360`:

```
overflow-y-auto flex-1 w-full px-4 py-4 pb-24 lg:px-8 lg:pb-8 max-w-3xl
```

The hero and the sheet both take `-mx-4 lg:-mx-8` to cancel the side padding,
and the sheet puts the padding back on its own inner content. Two elements
reach the edge; everything inside the sheet keeps the gutter it has now.

Rejected: moving `px-4` off the container and onto each child. It is the
correct shape and it edits every block on the page to get there, which is a
bigger diff than the feature and touches code this plan has no business in.

`py-4` stays. It is a 16px gap above the hero before any scrolling, and
`sticky top-0` pins to the scrollport's top edge regardless of it, so it costs
nothing once the page moves.

### Gap 4 resolved — the cap comes off, and the ARV card takes its place

Both capped lists are at `CompsPanel:835` (On the market) and `CompsPanel:868`
(Checked). Still-to-check is the one-card flow and has no list to cap. The
comment at 865 gives the reason for the ceiling:

> A ceiling on it keeps the ARV card on screen through eighty comps.

So the cap is not arbitrary and removing it is not free — it is what keeps the
resale figure visible while you scan. The answer is to keep the intent and drop
the mechanism: **the cap comes off both lists, and the ARV card becomes sticky
inside the sheet.** The sheet owns the scrolling, nothing nests, and the figure
still does not leave the screen.

If the sticky card does not hold up at 390px, the fallback is to keep the caps
and accept the nested scroll on those two tabs only — never on still-to-check,
which is where the reviewing actually happens.

### Stage 2 stays held

Two things are open and neither is mine to settle:

1. Whether wiring `mapSubjectFacts` into the comps refresh — and deciding what
   happens when RentCast's facts disagree with ones typed by hand, where
   `facts_source` is `'manual'` — belongs to this branch or its own.
2. The new dependency. `leaflet` + `react-leaflet` with CartoDB dark tiles is
   the recommendation: no key, no billing, and it does not punch a white hole
   in a dark page. It needs its own word under Tier 2.
