# Plan: a pasted address fills the form

Status: **User approved** — 2026-10-23. Asked to choose between paste-to-fill
only, paste-to-fill with Google suggestions, or with free suggestions, the
owner answered "1": **paste-to-fill only**, with suggestions possibly later
as a separate change. The owner also clarified: *"I'm not trying to add
several just want to paste the address on the address line and it works."*
Self-reviewed first (see the end).
Branch: `fix/paste-address`, from `main` after #67 merged.

## The problem

The owner: *"the paste parser is not working fix it and create a playwright
test for it."* Earlier: *"when I do this on address 2012 Shalimar Dr NE,
Atlanta, GA 30345 I have to backspace then paste the city, zip, state .. its
time consuming."*

There are two faults, checked against `parseAddressLines` on `main`:

**1. The one-house form doesn't parse a paste at all.** The street field
(`AddPropertyPage.tsx:197`) is a plain input. A full address pasted into it
stays there whole, and city, state and ZIP have to be typed again. This is the
owner's daily path.

**2. The parser behind "Add several" handles only one shape.**

| Pasted | Today |
|---|---|
| `2012 Shalimar Dr NE, Atlanta, GA 30345` | ✓ |
| `2012 Shalimar Dr NE, Atlanta GA 30345` | ✓ |
| `2012 Shalimar Dr NE Atlanta GA 30345` (no commas) | ✗ the whole line becomes the street |
| `…, Atlanta, GA 30345, USA` (Google and Zillow copy) | ✗ city "Atlanta GA 30345, USA", no state, no ZIP |
| `…, Atlanta, Georgia 30345` (state spelled out) | ✗ city "Atlanta, Georgia", no state |
| Street on one line, city on the next (Zillow's header) | ✗ "Doesn't start with a street number" |
| A spreadsheet row: address, a tab, `$249,900` | ✗ the price lands in the city |

## Goal

Paste any of those shapes into the street field on Add a house, and street,
city, state and ZIP fill themselves. That one field is what the owner uses.
The parser it relies on is shared with "Add several", so those shapes start
working there too, as a side effect rather than a goal.

## Stack

TypeScript and Tailwind. No new dependency.

## Approach

1. **Make the parser accept every shape in the table** (`lib/property/parseAddressLines.ts`):
   - Drop a trailing `USA` / `United States`.
   - Read a spelled-out state name as its two letters. This uses a
     50-state-plus-DC table, added in the parser or in `address.ts` if one
     already lives there.
   - Find the state and ZIP at the end of a line even with no commas. The
     street is everything before the city. Without commas, the city is found
     as the words between the last street-type word (St, Dr, NE, …) and the
     state.
   - Treat a tab as a field break, the way a comma is.
   - Join a street line with a following "City, ST ZIP" line, when that next
     line has no street number but does end in a state and ZIP.

   This edits the existing logic in place. Nothing is deleted.
2. **Add one small function, `parseOneAddress(text)`**, in the same file. It
   returns `{ addressLine1, city, state, zip }` or `null`, built on the same
   line parser. It is what the form uses.
3. **The form**: an `onPaste` on the street field. If the pasted text parses
   into more than a street, it fills street, city, state and ZIP and stops the
   raw paste. Otherwise the paste behaves normally. A line under the field says
   *"Filled in from what you pasted. Check it."* until the next edit.
   - **Never overwrites what's already typed**: a city, state or ZIP field that
     already has text keeps it.
   - **Typing is untouched.** Only a paste triggers this.

## Scope

| File | Change |
|---|---|
| `lib/property/parseAddressLines.ts` | The new shapes, plus `parseOneAddress` |
| `components/properties/AddPropertyPage.tsx` | `onPaste` on the street field, and the "Filled in" line |
| `tests/unit/parseAddressLines.test.ts` | One case per row of the table, plus `parseOneAddress`, plus "fills only empty fields" if that rule is a function |
| `tests/24-screen.spec.ts` | **One** Playwright journey: paste a full address into the street field, and all four fields fill, at 390px |

## Testing

- **Jest** (every case): each pasted shape in the table, a price after a tab,
  a two-line paste, the existing cases still passing, and junk that must not
  be guessed at (no street number, no ZIP).
- **Playwright** (the one journey): paste `2012 Shalimar Dr NE, Atlanta, GA
  30345` into the street field, then check street, city, state and ZIP. Also
  check a pre-filled city is kept, and the form fits at 390px. This is the
  test the owner asked for. It proves the paste reaches the form, which only a
  browser can.
- `tsc`, lint, build, and a look at 390px.

## Risks

- **The parser is shared**, so "Add several" changes too. The existing Jest
  cases must all still pass.
- **No-comma addresses are a guess** at where the street ends and the city
  starts. The "Check it" line, and never overwriting typed fields, keep a wrong
  guess cheap to spot and fix.
- No data, no migration, no config. No Tier 2 action beyond the branch
  question.

## Out of scope

- Looking an address up online (Google or Census autocomplete).
- Reading a Zillow URL for its address. The parser already keeps listing URLs
  separate.

## Approver (self-review)

Written by the same Claude that will build it, at the owner's standing
instruction. **It is not independent.**

- **Bug fixed in place**: the parser is extended, not replaced, and
  `parseOneAddress` builds on it rather than duplicating it.
- **Testing follows the rules**: one Playwright journey (asked for, and
  browser-only) and every case in Jest.
- **Writing rules**: one short line saying what happened and what to do.
- **Changed by this review**: the first draft overwrote city, state and ZIP
  on every paste. It now fills only empty ones, so a correction the owner has
  already typed survives.

**Recommendation:** approve. (#67 merged before this started, so no branch
exception was needed.)

## Outcome (2026-10-23)

- **Pasting into the street field** fills street, city, state and ZIP. Typing
  is unchanged. A city, state or ZIP already typed is kept, and the untouched
  default "GA" counts as not typed.
- **The parser now reads** commas or none, a trailing USA, a spelled-out state,
  a tab before the price, and a street line followed by a "City, ST ZIP" line.
- **Jest**: 619 pass. `parseAddressLines.test.ts` has a case for every shape,
  plus `parseOneAddress` and `fillFromPaste`.
- **Playwright**: 36 pass, including the new journey. It pastes from the real
  clipboard and checks what is saved. Run against the old build, it failed
  with the whole address left in the street field.
- `tsc` and the build pass. Lint is unchanged (33 issues, none in these
  files).
- Checked by eye at 390px.
- **Dropped at the owner's word ("Nvm then")**: prefilling beds, baths and
  size from RentCast. It would spend a second request per house, on top of the
  comps lookup.
