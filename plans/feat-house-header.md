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

**Fixed 2026-10-21**, on the owner's instruction to complete the rest of this
file. There were **six** user-facing strings, not four — `:231` and `:272`
are the same two faults again — plus `:269` leaking the raw word *comp*, and
two doc comments at `:37` and `:67` describing the dead tick as if it were
still there. All nine corrected.

The dead instruction is the one that mattered. The control is a question
button reading *"Was it fixed up like yours will be?"*
(`CompReviewCard.tsx:263`); there is no tick and has not been since the review
control replaced it. Both strings that said *tick* now quote the button the
owner will actually see.

"ARV step" became "ARV tab", which is what the thing is called in `TABS`.
*comps* became *sold houses* / *houses like this one that have already sold*.
ARV itself stays where it names the tab, because renaming the tab is a
different change.

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

---

# Stage C: the edit opens over the page, and it can set the photo

Status: **User approved** — 2026-10-21. Built.
Branch: `feat/house-header` (continuing; Stage B is in at `c203eb7`).

The owner replied "run it", which read two ways — build the stage, or run the
images migration. Asked rather than guessed, because one of the two readings
creates a public-read bucket. Answer: **build Stage C**. The migration stays
unrun and uploads stay out.
RentCast requests: **0**.
Migrations run: **0**.

## The problem

Two faults, both reported by the owner, both verified in the code.

**1. Edit scrolls instead of opening.**
`PropertyDetailPage.tsx:739` renders `<EditHouseForm>` inline, in the page
flow, *after* the house card, the finalist/edit row, the stage pill, the facts
grid and the parcel disclosure. `EditHouseForm.tsx:129` carries `mt-4` — it is
drawn as one more band of the page. So on a 390px screen, tapping **Edit** at
the top puts the form roughly a screen and a half below the thumb, with no
visible change where the tap happened. The page looks like it ignored you.

**2. There is no box to add a photo of the house, anywhere on this page.**
Verified at all four layers:

- `EditHouseForm.tsx:19-33` — `EditableHouse` has no `photo_url` member. The
  form cannot even read the current photo, let alone write one.
- `propertyService.ts:260-276` — `PropertyFactsPatch` has no `photoUrl`.
- `app/api/properties/[id]/route.ts` PATCH — parses eleven fields, none of
  them a photo. `photo_url` appears in `propertyService.ts:153` only, which is
  the *create* path.
- `AddPropertyPage.tsx:215` — the **Add** page does have an "Image URL" field.
  So a photo can be set once, at creation, and never corrected or added later.

And the empty state makes a promise the app cannot keep.
`PropertyDetailPage.tsx:433` reads *"No photo yet — add one when you edit the
house."* The edit form has no such field. The copy is wrong today.

Stage B made the photo the hero of the card — a 44px-tall band of apology
when it is missing. That raised the cost of this gap rather than creating it.

## Goal

Tapping **Edit** opens the form over the page, where the tap happened. The
form can set the house's photo. The empty state offers the thing it names.

## Stack

TypeScript strict, Tailwind utilities, tokens from `globals.css`. No new
packages. No new files.

## Scope

Four files, all existing:

| File | Change |
|---|---|
| `components/crm/EditHouseForm.tsx` | Modal shell around the existing form; photo field added |
| `components/crm/PropertyDetailPage.tsx` | `EditableHouse` cast gains `photo_url`; empty state becomes a button |
| `lib/property/propertyService.ts` | `PropertyFactsPatch.photoUrl` + one line in the fact-key loop |
| `app/api/properties/[id]/route.ts` | `photoUrl` parsed and URL-validated |
| `tests/22-navigation.spec.ts` | Three tests added to the existing edit-form block |

No new file. The modal shell goes *inside* `EditHouseForm.tsx` wrapping its
own `<form>`, because a dialog is that component's presentation, not a second
component — and the three other modals in this codebase (`NumbersModal`,
`FirstRunIncomeModal`, `CompReviewCard`) each hand-roll their own shell, so
there is no shared `Modal` to import and inventing one here would be a
refactor of three unrelated files that nobody asked for. Noted as a known
duplication below rather than hidden.

## Approach

### C1 — the form becomes a dialog

`EditHouseForm` returns the same `<form>`, with the same `data-testid`s and
the same fields, wrapped in the shell `NumbersModal.tsx:124-145` already
establishes in this codebase:

- `fixed inset-0 z-50`, `role="dialog"`, `aria-modal="true"`,
  `aria-label="Edit this house"`
- a `bg-black/60` backdrop button that closes through `onCancel`
- three rows: fixed header ("Edit this house" + ✕), scrolling body
  (`flex-1 min-h-0 overflow-y-auto`), footer holding Save/Cancel so they stay
  reachable on a 390px screen rather than sitting past eleven fields
- full-bleed on a phone (`w-full h-full`), a centred card from `sm:` up
  (`sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl`)
- Escape closes; `document.body.style.overflow = "hidden"` while open, restored
  on unmount — both copied from `NumbersModal.tsx:62-79`

Save and Cancel keep their current behaviour and their current test ids. The
`mt-4` goes; a dialog is not a band of the page.

`PropertyDetailPage.tsx:739-749` keeps its `{property && editingHouse && …}`
render exactly as written. Nothing moves in the page's own structure — the
component simply no longer occupies flow. `edit-house-toggle` stops saying
"Close" when open, since the dialog's own ✕ is the close now and a button
behind a backdrop cannot be tapped.

**Not guarded on unsaved changes.** `NumbersModal` traps a tapped-away model
behind a confirm; this form is eleven short fields that reload from the house
in a second, and a confirm on every backdrop tap is friction for the common
case. Called out because it is a deliberate difference from the pattern being
copied, not an oversight.

### C2 — the photo field

One field, labelled **Photo link**, in the modal body after Listing link:

```
Photo link
[ https://…                                   ]
Paste a link to a photo — the main listing image works. Right-click
the photo on Zillow and copy the image address.
```

Plus a live thumbnail under the box when the value parses as an `http(s)` URL,
so a wrong paste is visible before saving rather than after.

**A pasted URL, not an upload.** The upload half needs the
`property-images` bucket from `supabase/migrations/20261019050000_property_images.sql`,
which is **written and not run** — and that migration's own header says the
bucket is public-read, which is a decision about what the internet can read
and is the owner's to make, not something to slip in behind a UI change. An
upload button over a bucket that does not exist is a dead control that fails
at the moment of use. `AddPropertyPage.tsx:218-221` already words this
honestly for the Add page; the same honesty applies here, in fewer words
because this form has eleven fields and no room for a paragraph.

If the owner wants the bucket run, uploads are a separate branch on top.

### C3 — the write path

`photoUrl?: string | null` on `PropertyFactsPatch`, and `["photoUrl",
"photo_url"]` appended to the `factKeys` loop at `propertyService.ts:330-339`
— that loop is typed against the generated `PropertyUpdate`, so a wrong column
name fails to compile. `photo_url` is in the generated types already
(`database.types.ts:1626`), so no `writeTolerating` accommodation is needed.

In the PATCH route, `photoUrl` goes through the existing
`textOrNullOrSkip` helper and then the same `^https?:\/\//i` check the route
already applies to `listingUrl:197-202`, with its own message: *"The photo
link must start with http:// or https://"*. Clearing it (`""` → `null`)
removes the photo, which is how a wrong paste gets undone.

Setting a photo counts as a hand-entered fact, so it rides the existing
`touchedFacts` → `facts_source = "manual"` path. That is correct and worth
stating: it means a RentCast refresh will not overwrite a photo the owner
chose.

### C4 — the empty state tells the truth

`PropertyDetailPage.tsx:428-436` becomes a button that opens the dialog:

> **No photo of this house yet.** → `Add a photo`

Same band, same height, now with the control the sentence names — which is
what the writing rules ask of an empty state, and what the current copy
pretends to have.

## Refactors

- `EditHouseForm`'s existing `<form>`, fields, state and `submit` are
  **untouched** — the shell wraps them. No field is rewritten to add the
  modal, and the photo field is appended rather than threaded through
  anything existing.
- `textOrNullOrSkip` and the `listingUrl` URL check are reused, not
  re-implemented.
- The `factKeys` loop is extended by one row rather than a new branch.

## Risks

- **Tier 2 — a public interface changes shape.** `EditableHouse` gains
  `photo_url: string | null`. One call site (`PropertyDetailPage.tsx:741`),
  which casts the property through `as unknown as EditableHouse` and so
  already carries the field. Checked: no other importer of `EditHouseForm`.
- **Tier 2 — `PropertyFactsPatch` gains a member.** Optional, so no existing
  caller breaks. One caller, checked: `app/api/properties/[id]/route.ts:130`.
  (Corrected from the draft, which claimed two.)
- **Three Playwright tests in `tests/22-navigation.spec.ts` touch this form**
  (lines 316, 334, 350, 362). All four use `data-testid`, all of which
  survive, and the 390px overflow test at `:358` is the one that matters most
  for a full-bleed dialog. Expected to pass unchanged; if any fails that is a
  real regression, not a stale assertion.
- **No migration is run.** The bucket stays uncreated. Nothing in this stage
  needs it.
- **Known duplication, stated not hidden:** this is the fourth hand-rolled
  modal shell in the codebase. A shared `Modal` is the right fix and is a
  separate refactor across four files; doing it inside a UI-fix branch would
  be the scope creep the rules forbid.
- **Backdrop tap discards typing without a confirm** (C1). Deliberate.

## Testing

`npx playwright test tests/22-navigation.spec.ts`, plus `npm run build` and
`tsc --noEmit`.

Existing, must still pass: the four edit-form tests at `:316`, `:330`, `:340`,
`:358`.

Added to the same block:

1. **The form opens over the page, not below it** — after tapping Edit, the
   form's bounding box top is above the viewport fold and
   `role="dialog"` is present. This is the reported bug, so it gets the test
   that reproduces it.
2. **A pasted photo link saves** — fill `edit-house-photo`, Save, assert the
   PATCH body carries `photoUrl`.
3. **The dialog fits 390px with Save reachable** — no document overflow, and
   `edit-house-save` is in the viewport without scrolling. The existing
   `:358` test checks overflow only; a footer pushed off a phone screen is
   the specific way this shell can fail.

Verified by hand at 390px before the hand-off, per the mobile-first rule, and
reported as what was seen rather than what the code should do.

## Out of scope

- Running the images migration or creating the bucket. Owner's call, its own
  line-item instruction.
- Uploading a photo from the phone's camera roll. Needs the bucket.
- Multiple photos per house. The column holds one.
- A shared `Modal` component across the four hand-rolled shells.
- The Add page's photo field and copy. Already works.
- The four banned strings in `explainDeal` found during Stage B and
  deliberately left.

## Approver review — 2026-10-21

Reviewed against `CLAUDE.md`: scope, stack, refactor-first, risks, testing,
Tier 2. Same caveat as Stage B — the reviewer is the same hand that drew the
plan, so this checks claims against code and cannot judge whether the design
is right.

### 1. The caller count was wrong again

The draft said `PropertyFactsPatch` has "two callers checked: the PATCH route
and the test stub." There is **one**: `route.ts:130`. No test constructs a
patch — the Playwright tests assert the JSON body over the wire, never the
type. Corrected in Risks. A plan that overstates its blast radius is a smaller
fault than one that understates it, but Stage B's review caught the same class
of error (a count claimed, not counted) and it should not have recurred.

### Verified as claimed

- `PropertyDetailPage.tsx:739` does render `<EditHouseForm>` inline in the
  page flow, after the facts grid and the parcel disclosure, with `mt-4` on
  the form at `EditHouseForm.tsx:129`. The scroll the owner reported is real.
- `EditableHouse` (`:19-33`) has no `photo_url`. `PropertyFactsPatch`
  (`:260-276`) has no `photoUrl`. The PATCH route parses no photo field.
  Four layers, no photo path — as described.
- `EditHouseForm` has exactly one importer, `PropertyDetailPage.tsx:46`, and
  it casts `as unknown as EditableHouse` from a `DetailProperty`, which does
  carry `photo_url` (`lib/crm/types.ts:185`). Adding the field to
  `EditableHouse` breaks nothing.
- `photo_url` is in the generated types (`database.types.ts:1626`), so the
  typed `factKeys` loop takes it without a `writeTolerating` accommodation.
  Confirmed: `writeTolerating` is used for `list_price` only (`:161`, `:184`).
- `supabase/migrations/20261019050000_property_images.sql` is present,
  unrun, and its own header says the bucket is public-read and needs the
  owner's approval twice over. The plan's refusal to ship an upload button is
  consistent with that file, not a convenience.
- `AddPropertyPage.tsx:215-221` has the Image URL field and the honest note
  about the bucket. The plan reuses that wording rather than inventing a
  second explanation.
- Four existing edit-form tests at `tests/22-navigation.spec.ts:316`, `:330`,
  `:340`, `:358`, all keyed on `data-testid`s the plan preserves.

### Open question for the owner

The photo is a **pasted link only**. Uploading from the camera roll needs the
images migration run and a public-read bucket created — the owner's call, its
own instruction, its own branch. If the answer is "run it", this stage still
lands first and uploads go on top of it.

**Recommendation: proceed.** The two faults are verified at every layer, the
fix touches four existing files and creates none, and the one thing it
deliberately will not do is the one thing that needs the owner's permission.

**Not approval to start. The owner decides.**

---

# Stage D: Playwright for journeys, Jest for functions

Status: **Done** — 2026-10-21. Policy applied to CLAUDE.md; group A
diagnosed and migrated. Groups B and C kept, as planned.
RentCast requests: **0**. Migrations run: **0**.

## Why

The owner's instinct — Playwright for major features, Jest for minor ones —
is right, and the numbers say how right:

| | count | time |
|---|---|---|
| Jest | 486 | **1.2s** |
| Playwright | 163 | **~10 min** |

Of 148 Playwright tests that could be parsed, **27 are render-and-read**: no
click, no layout check, no navigation. They boot a browser to assert a string
a pure function returns. Sixteen of the 27 are in `23-comps.spec.ts`.

The clearest case, now fixed: `23-comps` asserted *"the ARV is the median
price per sqft times the subject size"* through Chromium, while
`tests/unit/arv.test.ts` already had 86 unit tests on the same maths. The
browser copy was failing; the unit copy passed.

This is also why the suite rots. A renamed testid breaks a browser test; the
maths stays green in Jest where it belongs.

## The rule

Not "major vs minor" — that is hard to adjudicate at 2am. The line is **what
the test needs**:

- **Playwright** — what only a browser can prove: a journey end to end, a
  click producing the right request, routing, and 390px layout. **One wiring
  test per feature, not one per case.**
- **Jest** — anything that is a function: calculations, verdicts, label and
  copy mapping, parsing, error-message selection. Cases and edges live here.
- "Does X show the right value for inputs A/B/C" is a Jest test. "Does the
  value reach the screen at all" is the Playwright one.

Proposed wording for `CLAUDE.md`'s Testing section is in **Open questions**
below — not applied yet, because it changes the rules this repo runs on.

## Done so far (`5c5dc6e`)

14 Jest cases for `perSqft`, `priceLabel`, `provenanceLabel`,
`fixerUpperNote`, `compDate` — four of the five had no unit cover at all.
Added to `tests/unit/arv.test.ts`, which already tests `format.ts`, so no new
file. Two browser tests retired. 23-comps: 14 failing of 52 → 13 of 50.

## The remaining 25, with a disposition each

Not a blanket delete. Several of the 27 are **not** pure logic, and deleting
them would lose real cover.

**A — retire, logic now or already in Jest (6)**

| Test | Covered by |
|---|---|
| 23-comps: the ARV is the median price per sqft × subject size | `calculateArv`, 86 cases |
| 23-comps: the ARV says what it is built on | `basisLabel` cases |
| 23-comps: a comp set with no confirmed sales carries a warning | `warnings` cases |
| 23-comps: a comp missing its size is skipped and declared | `assessComps` |
| 27-recorded-sales: recorded sales show as Sold, county record | `provenanceLabel` (new) |
| 27-recorded-sales: an ordinary sale carries no fixer flag | `fixerUpperNote` (new) |

**Corrected after diagnosing each — the draft's claim that all six were
failing was wrong.** Four were (the 23-comps group). Of the two in
27-recorded-sales, both were *passing*; the failing test in that file was a
different one, *a possible fixer-upper is flagged*, which asserted
`"Untick it to leave it out"` — wording the app dropped when the review card
replaced the tick. The app was right and the test was holding it to retired
copy, so that one was **updated and kept** as the fixer flag's wiring test
rather than retired.

Diagnosis per test, before anything was removed:

| Test | Why it failed | Disposition |
|---|---|---|
| the ARV is the median price per sqft × size | expected $359,375; size-adjusted median gives $380,250 | retired — formula replaced |
| the ARV says what it is built on | expected "median $205/sqft" basis wording | retired — `basisLabel` covered |
| no confirmed sales carries a warning | warning wording changed with the rewrite | retired — `warnings` covered |
| a comp missing its size is skipped | eligibility filter changed | retired — `skippedForMissingData` covered |
| recorded sales show as Sold, county record | *was passing* | **kept** — the wiring test for recorded sales |
| an ordinary sale carries no fixer flag | *was passing* | retired — `fixerUpper: false` covered at `arv.test.ts:670` |

The four retired were each failing on arithmetic the app had deliberately
stopped doing. None was retired before its Jest equivalent was confirmed
passing.

**B — keep, they are not read-only in substance (13)**

Conditional rendering driven by permission, quota and lock state:
*a non-owner cannot force a refresh*, *at the monthly cap Refresh is removed*,
*no RentCast key hides Refresh and says why*, *a locked house offers Refresh
early*, *an unlocked house just offers Refresh*, *rebuild is hidden when
nothing has been saved*, and the rest of the lock/cap group.

The predicate belongs in Jest; **whether the control is on the screen** is an
integration fact. Extracting these predicates is a component refactor and is
not in this stage.

**C — keep as the one wiring test (6)**

*comps show Removed rather than Sold*, *an empty ARV card does not say the
same thing twice*, *the basis line returns once there is a number*, and the
three buyer-profile first-run tests. These are the "it reaches the screen"
tests the rule explicitly keeps.

## Risks

- **Retiring a failing test can hide a bug.** Mitigated by diagnosing each
  before it goes, and by the Jest case landing first. Done that way for the
  date test in `5c5dc6e`; group A gets the same treatment.
- **A policy over a red suite is unenforceable.** 36 of 165 were failing when
  this started, and **Playwright has been commented out of CI since
  `e386a56`, 2026-07-09** — three and a half months. The rule changes nothing
  until something runs it.
- Group B wants a component refactor to do properly. Deliberately deferred.

## Testing

`npx jest` after each slice, and the touched spec before and after, comparing
failure counts rather than asserting green — this suite is not green.

## Out of scope

- Re-enabling the Playwright CI job (`.github/workflows/ci.yml:49`).
- `devIndicators: false` in `next.config.ts`.
- The other 36 pre-existing suite failures.
- Extracting group B's predicates out of `CompsPanel`.

## Open questions for the owner

1. **The CLAUDE.md wording.** Proposed replacement for the Testing section:

   > - Playwright covers journeys, not cases: a feature gets one test that it
   >   works end to end on a phone, plus its 390px layout check.
   > - Every other case — calculations, verdicts, labels, parsing, errors —
   >   is a Jest unit test against the function, not the screen.
   > - Before adding a Playwright test, ask whether a Jest test would prove
   >   the same thing. If it would, write that instead.
   > - A major feature is not done until its Playwright journey test passes.

2. **Group A**: retire all six after diagnosing each, or leave them failing
   and visible until the suite is green overall?
